/**
 * Siembra el chat social de la demo: crea unos compañeros de staff y unas conversaciones (DM con ida y
 * vuelta + actividad en el canal General) para que la mensajería interna se vea viva. Idempotente-ish:
 * si un usuario ya existe (email duplicado) se reutiliza haciendo login.
 *
 * Uso: node apps/api/scripts/seed-demo-chat.mjs
 */
const API = process.env.API_URL ?? 'https://lawzora-api.fly.dev/api';
const ADMIN = { email: 'demo@demo.lawzora', password: 'Lawzora.Demo-2026!' };
const PASS = 'Bufete.Demo-2026!';

const COLLEAGUES = [
  { email: 'carlos.mendez@demo.lawzora', fullName: 'Carlos Méndez', role: 'LAWYER' },
  { email: 'ana.torres@demo.lawzora', fullName: 'Ana Torres', role: 'LAWYER' },
  { email: 'javier.ruiz@demo.lawzora', fullName: 'Javier Ruiz', role: 'LAWYER' },
];

async function http(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function login(email, password) {
  const r = await http('POST', '/auth/login', null, { email, password });
  if (r.status !== 200 || !r.json?.accessToken) {
    throw new Error(`login ${email} -> ${r.status} ${JSON.stringify(r.json)}`);
  }
  return r.json.accessToken;
}

async function main() {
  const adminTok = await login(ADMIN.email, ADMIN.password);
  console.log('✓ admin login');

  // Directorio actual para mapear email->id (y detectar existentes).
  const dir = await http('GET', '/messaging/directory', adminTok);
  console.log(`directorio actual: ${dir.json.map((u) => u.fullName).join(', ')}`);

  const tokens = {}; // fullName -> token
  const ids = {}; // fullName -> userId

  for (const c of COLLEAGUES) {
    let id = null;
    const created = await http('POST', '/users', adminTok, {
      email: c.email,
      fullName: c.fullName,
      password: PASS,
      role: c.role,
    });
    if (created.status === 201 || created.status === 200) {
      id = created.json.id;
      console.log(`✓ creado ${c.fullName} (${id})`);
    } else if (created.status === 409) {
      console.log(`· ${c.fullName} ya existía, reutilizo`);
    } else {
      console.log(`✗ alta ${c.fullName} -> ${created.status} ${JSON.stringify(created.json)}`);
      continue;
    }
    // Login como el compañero (mustChangePassword no bloquea la API).
    try {
      tokens[c.fullName] = await login(c.email, PASS);
    } catch (e) {
      console.log(`✗ login ${c.fullName}: ${String(e)}`);
      continue;
    }
    // Si no teníamos id (ya existía), lo resolvemos del directorio.
    if (!id) {
      const d2 = await http('GET', '/messaging/directory', adminTok);
      id = d2.json.find((u) => u.fullName === c.fullName)?.id ?? null;
    }
    ids[c.fullName] = id;
  }

  // Conversaciones DM con ida y vuelta (admin ⇄ cada compañero).
  const dms = [
    {
      who: 'Carlos Méndez',
      msgs: [
        ['admin', '¿Has podido revisar el borrador del contrato de Construcciones Delta?'],
        ['Carlos Méndez', 'Sí, le he dado un repaso. Te dejo los comentarios en el data room esta tarde 👍'],
        ['admin', 'Perfecto, gracias Carlos.'],
      ],
    },
    {
      who: 'Ana Torres',
      msgs: [
        ['Ana Torres', 'Recuerda que mañana tenemos la vista del caso Pérez a las 9:30.'],
        ['admin', 'Anotado. ¿Llevas tú la documentación o la preparo yo?'],
        ['Ana Torres', 'La llevo yo, ya está toda en la carpeta del expediente. 📁'],
      ],
    },
    {
      who: 'Javier Ruiz',
      msgs: [
        ['admin', 'Javier, ¿puedes encargarte del registro mercantil de la nueva sociedad?'],
        ['Javier Ruiz', 'Claro, lo gestiono esta semana. Te aviso cuando esté presentado.'],
      ],
    },
  ];

  const tokenFor = (label) => (label === 'admin' ? adminTok : tokens[label]);

  for (const dm of dms) {
    const peerId = ids[dm.who];
    const peerTok = tokens[dm.who];
    if (!peerId || !peerTok) {
      console.log(`· salto DM con ${dm.who} (sin id/token)`);
      continue;
    }
    const open = await http('POST', '/messaging/direct', adminTok, { userId: peerId });
    const convId = open.json.id;
    for (const [label, body] of dm.msgs) {
      const tok = tokenFor(label);
      if (!tok) continue;
      await http('POST', `/messaging/conversations/${convId}/messages`, tok, { body });
    }
    console.log(`✓ DM admin ⇄ ${dm.who} (${dm.msgs.length} mensajes)`);
  }

  // Actividad en el canal General.
  const convs = await http('GET', '/messaging/conversations', adminTok);
  const general = convs.json.find((c) => c.kind === 'CHANNEL');
  if (general) {
    const generalMsgs = [
      ['admin', '¡Bienvenidos al canal General del despacho! 🎉 Aquí coordinamos lo del día a día.'],
      ['Ana Torres', 'Gracias 🙌 ¿Quién se apunta a comer el viernes?'],
      ['Carlos Méndez', 'Yo me apunto 🍝'],
      ['Javier Ruiz', 'Contad conmigo también.'],
    ];
    for (const [label, body] of generalMsgs) {
      const tok = tokenFor(label);
      if (!tok) continue;
      await http('POST', `/messaging/conversations/${general.id}/messages`, tok, { body });
    }
    console.log(`✓ General (${generalMsgs.length} mensajes)`);
  }

  // Verificación final.
  const finalConvs = await http('GET', '/messaging/conversations', adminTok);
  console.log('\n=== Conversaciones del admin tras sembrar ===');
  for (const c of finalConvs.json) {
    const name = c.kind === 'CHANNEL' ? '# General' : `DM ${c.peer?.fullName}`;
    console.log(`  ${name} — última: "${c.last?.body?.slice(0, 40) ?? '∅'}" — no leídos: ${c.unread}`);
  }
  console.log('\nContraseña de los compañeros demo:', PASS);
}

main().catch((e) => {
  console.error('FALLO:', e);
  process.exit(1);
});
