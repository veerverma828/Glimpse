require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10_000,
  pingTimeout: 5_000,
});

app.get('/health', (req, res) => res.json({ ok: true }));

// roomId -> { hostSocketId, viewers: Set<socketId> }
const rooms = new Map();

app.get('/api/create-room', (req, res) => {
  const roomId = nanoid(6);
  rooms.set(roomId, { hostSocketId: null, viewers: new Set() });
  res.json({ roomId });
});

io.on('connection', (socket) => {
  socket.on('host-join', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error-msg', 'Room not found');
    room.hostSocketId = socket.id;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'host';
    // Confirm to host that join succeeded
    socket.emit('host-joined-ack', { roomId });
  });

  socket.on('viewer-join', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.hostSocketId) {
      socket.emit('error-msg', 'Room not active');
      return;
    }
    room.viewers.add(socket.id);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'viewer';
    socket.emit('viewer-joined-ack', { roomId });
    io.to(room.hostSocketId).emit('viewer-joined', { viewerId: socket.id });
  });

  // WebRTC signaling relay
  socket.on('signal', ({ to, data }) => {
    let targetId = to;
    if (!targetId) {
      // Viewer without explicit target -> route to host
      if (socket.data.role === 'viewer') {
        const room = rooms.get(socket.data.roomId);
        targetId = room?.hostSocketId;
      }
      // Host without explicit target -> route to first viewer (fallback)
      if (socket.data.role === 'host') {
        const room = rooms.get(socket.data.roomId);
        if (room && room.viewers.size > 0) {
          targetId = [...room.viewers][0];
        }
      }
    }
    if (targetId) {
      io.to(targetId).emit('signal', { from: socket.id, data });
    } else {
      console.warn(`[signal] No target for ${socket.data.role} in room ${socket.data.roomId}`);
    }
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.hostSocketId === socket.id) {
      io.to(roomId).emit('host-left');
      rooms.delete(roomId);
    } else {
      room.viewers.delete(socket.id);
      if (room.hostSocketId) io.to(room.hostSocketId).emit('viewer-left', { viewerId: socket.id });
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Signaling server on :${PORT}`));
