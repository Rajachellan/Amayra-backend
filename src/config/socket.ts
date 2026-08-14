import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
import { logger } from "./logger.js";

let io: Server | null = null;

export function initSocketIO(server: HTTPServer) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    },
  });

  io.on("connection", (socket) => {
    logger.info(`Socket client connected: ${socket.id}`);

    socket.on("join-admin", () => {
      socket.join("admins");
      logger.info(`Socket client ${socket.id} joined admin room`);
    });

    socket.on("disconnect", () => {
      logger.info(`Socket client disconnected: ${socket.id}`);
    });
  });

  logger.info("Socket.IO server initialized");
  return io;
}

export function getIO(): Server {
  if (!io) {
    return {
      to: (room: string) => ({
        emit: (event: string, _data: any) => {
          logger.warn(`getIO() called before initSocketIO() - event '${event}' to room '${room}' not sent`);
          return true;
        },
      }),
      emit: (event: string, _data: any) => {
        logger.warn(`getIO() called before initSocketIO() - event '${event}' not sent`);
        return true;
      },
    } as unknown as Server;
  }
  return io;
}

export function emitToAdmins(event: string, data: any): void {
  try {
    const ioInstance = getIO();
    ioInstance.to("admins").emit(event, data);
  } catch (err) {
    logger.error({ err }, `Failed to emit event ${event} to admins`);
  }
}
