let express = require('express');
let http = require('http');
let app = express();
let cors = require('cors');
let httpServer = http.createServer(app);
let { Server } = require('socket.io');
let io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: '*'
  }
});

app.use(cors());
const PORT = process.env.PORT || 23000;

let rooms = {};

let socketToRoom = {};

const maximum = 4;

io.on('connection', (socket) => {
  console.log('connection');

  // 관리자 전용 방 호출
  socket.on('createRoom', (data) => {
    console.log('Create Room : ', data);
    if (rooms[data.room]) {
      // 방이 가득 찬경우
      const length = rooms[data.room].length;
      if (length === maximum) {
        io.sockets.to(socket.id).emit('roomFull');
        return;
      }
      // 기존 방에 참여
      rooms[data.room].push({ id: socket.id, type: 'HOST' });
      io.sockets.to(socket.id).emit('roomJoin');
      console.log(
        `[${socketToRoom[socket.id]}]. ROOM ${data.room} Joined. GUEST : ${
          socket.id
        }`
      );
    } else {
      // 방 새로 생성
      rooms[data.room] = [{ id: socket.id, type: 'HOST' }];
      io.sockets.to(socket.id).emit('roomCreate');
      console.log(
        `[${socketToRoom[socket.id]}] ROOM ${data.room} Created. HOST : ${
          socket.id
        }`
      );
    }
    socketToRoom[socket.id] = data.room;
    socket.join(data.room);

    const usersInThisRoom = rooms[data.room].filter(
      (user) => user.id !== socket.id
    );
    console.log('Users In This Room : ', usersInThisRoom);

    io.sockets.to(socket.id).emit('allUsers', usersInThisRoom);
  });

  // 장비 전용 방 호출
  socket.on('joinRoom', (data) => {
    console.log('Join Room : ', data);
    if (rooms[data.room]) {
      // 기존 방에 참여
      rooms[data.room].push({ id: socket.id, type: 'GUEST' });
      io.sockets.to(socket.id).emit('roomJoin');
    } else {
      // 방이 존재하지 않음
      io.sockets.to(socket.id).emit('invalidRoom');
      return;
    }
    socketToRoom[socket.id] = data.room;
    socket.join(data.room);

    const usersInThisRoom = rooms[data.room].filter(
      (user) => user.id !== socket.id
    );

    console.log('Users In This Room : ', usersInThisRoom);

    io.sockets.to(socket.id).emit('allUsers', usersInThisRoom);
  });

  // 장비 전용 방 호출
  socket.on('checkRoom', (data) => {
    console.log('Check Room : ', data);
    if (rooms[data.room]) {
      // 방이 존재
      io.sockets.to(socket.id).emit('validRoom');
    } else {
      // 방이 존재하지 않음
      io.sockets.to(socket.id).emit('invalidRoom');
    }
  });

  socket.on('offer', (sdp) => {
    console.log('offer: ' + socket.id);
    socket.broadcast.emit('getOffer', sdp);
  });

  socket.on('answer', (sdp) => {
    console.log('answer: ' + socket.id);
    socket.broadcast.emit('getAnswer', sdp);
  });

  socket.on('candidate', (candidate) => {
    console.log('candidate: ' + socket.id);
    socket.broadcast.emit('getCandidate', candidate);
  });

  socket.on('disconnect', () => {
    // 방장이 로그아웃 한경우 방 폭파
    console.log(`[${socketToRoom[socket.id]}]: ${socket.id} exit`);
    const roomID = socketToRoom[socket.id];
    let room = rooms[roomID];
    if (room) {
      room = room.filter((user) => user.id !== socket.id);
      rooms[roomID] = room;
      if (room.length === 0) {
        delete rooms[roomID];
        return;
      }
      // 관리자가 한명도 없는 경우 방 삭제
      let hosts = room.filter((user) => user.type == 'HOST');
      if (hosts.length === 0) {
        for (let i in room) {
          delete socketToRoom[room[i].id];
        }
        delete rooms[roomID];
        return;
      }
    }

    socket.broadcast.to(room).emit('userExit', { id: socket.id });
  });
});

httpServer.listen(PORT, () => {
  console.log(`server running on ${PORT}`);
});
