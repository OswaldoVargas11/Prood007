import { Module } from '@nestjs/common';
import { DataRoomController } from './data-room.controller';
import { DataRoomExternalController } from './data-room-external.controller';
import { DataRoomService } from './data-room.service';

@Module({
  controllers: [DataRoomController, DataRoomExternalController],
  providers: [DataRoomService],
  exports: [DataRoomService],
})
export class DataRoomModule {}
