const express = require('express');
const path = require('path');
const http = require('http');
let app = express();
let httpServer = http.createServer(app);
let { Server } = require('socket.io');
let io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: '*'
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '/public/client.html'));
});

const PORT = process.env.PORT || 23000;
let rooms = {};
let socketToRoom = {};
const MAXIMUM = process.env.MAX || 5;

io.on('connection', (socket) => {
  console.log('connection');

  // 관중 전용 방 호출
  socket.on('createRoom', (data) => {
    console.log('Create Room : ', data);

    if (rooms[data.room]) {
      // 방에 참여
      if (rooms[data.room].length > MAXIMUM) {
        socket.to(socket.id).emit('fullRoom');
        return;
      }
      rooms[data.room].push({ id: socket.id, type: 'AUDIENCE' });
      console.log(`ROOM ${data.room} Joined. AUDIENCE : ${socket.id}`);
    } else {
      // 방 새로 생성
      rooms[data.room] = [{ id: socket.id, type: 'AUDIENCE' }];
      console.log(`ROOM ${data.room} Created. AUDIENCE : ${socket.id}`);
    }

    socketToRoom[socket.id] = data.room;
    socket.join(data.room);

    const streamer = rooms[data.room].filter(
      (user) => user.type === 'STREAMER'
    );
    // 스트리머 정보 전달
    io.sockets.to(socket.id).emit('getStreamer', streamer);
  });

  // 스트리머 전용 방 호출
  socket.on('joinRoom', (data) => {
    if (rooms[data.room]) {
      rooms[data.room].push({
        id: socket.id,
        type: 'STREAMER'
      });
    } else {
      socket.to(socket.id).emit('invalidRoom');
      return;
    }
    socketToRoom[socket.id] = data.room;
    socket.join(data.room);

    const usersInThisRoom = rooms[data.room].filter(
      (user) => user.id !== socket.id
    );

    // 방에 입장한 관중 정보 전달
    io.sockets.to(socket.id).emit('getAudience', usersInThisRoom);
  });

  // 스트리머 전용 방 검사
  socket.on('checkRoom', (data) => {
    if (rooms[data.room]) {
      // 방이 존재
      io.sockets.to(socket.id).emit('validRoom');
    } else {
      // 방이 존재하지 않음
      io.sockets.to(socket.id).emit('invalidRoom');
    }
  });

  // 특정 대상에게 자신을 붙여달라는 요청
  socket.on('offer', (data) => {
    socket.to(data.offerReceiveID).emit('getOffer', {
      sdp: data.sdp,
      offerSendID: data.offerSendID
    });
    console.log('offer', data.offerSendID, '=>', data.offerReceiveID);
  });

  // 붙여달라는 요청에 대한 승낙
  socket.on('answer', (data) => {
    socket
      .to(data.answerReceiveID)
      .emit('getAnswer', { sdp: data.sdp, answerSendID: data.answerSendID });
    console.log('answer', data.answerSendID, '=>', data.answerReceiveID);
  });

  // 사용자 등록
  socket.on('candidate', (data) => {
    socket.to(data.candidateReceiveID).emit('getCandidate', {
      candidate: data.candidate,
      candidateSendID: data.candidateSendID
    });
    console.log(
      'candidate',
      data.candidateSendID,
      '=>',
      data.candidateReceiveID
    );
  });

  // 연결 종료
  socket.on('disconnect', () => {
    console.log(`[${socketToRoom[socket.id]}]: ${socket.id} exit`);
    const roomID = socketToRoom[socket.id];
    let room = rooms[roomID];
    if (room) {
      // 방이 빈 경우 방 삭제
      room = room.filter((user) => user.id !== socket.id);
      rooms[roomID] = room;
      if (room.length === 0) {
        delete rooms[roomID];
        return;
      }
      // 관중이 없는 경우 방 삭제
      let audience = room.filter((user) => user.type === 'AUDIENCE');
      if (audience.length === 0) {
        delete rooms[roomID];
        return;
      }
    }
    socket.to(roomID).emit('userExit', { id: socket.id });
    console.log(`current ${roomID} users : ${rooms[roomID]}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`server running on ${PORT}`);
});
