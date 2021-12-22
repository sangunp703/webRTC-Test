const PC_CONFIG = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    }
  ]
};
// URL로 부터 장비 이름을 추출
let part = window.location.href.split('/');
if (
  part.length > 1 &&
  part[part.length - 1] !== undefined &&
  part[part.length - 1] !== ''
) {
  const DEVICE_ID = part[part.length - 1];
  const SOCKET_SERVER_URL = `https://${DEVICE_ID}-cam.lt.thingbine.com`;
  const socketRef = io(SOCKET_SERVER_URL);
  let localStreamRef = null;
  let pcsRef = {};

  getLocalStream();

  // 방에 입장하여 관중 정보 획득한 경우
  socketRef.on('getAudience', (audience) => {
    // 관중 마다 RTC 피어를 생성하고 접속 요청
    audience.forEach(async (user) => {
      if (!localStreamRef) return;
      const pc = createPeerConnection(user.id);
      if (!(pc && socketRef)) return;
      pcsRef = { ...pcsRef, [user.id]: pc };
      try {
        const localSdp = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        console.log('create offer success');
        await pc.setLocalDescription(new RTCSessionDescription(localSdp));
        socketRef.emit('offer', {
          sdp: localSdp,
          offerSendID: socketRef.id,
          offerReceiveID: user.id
        });
      } catch (e) {
        console.error(e);
      }
    });
  });

  // 접속 요청 받은 경우
  socketRef.on('getOffer', async (data) => {
    const { sdp, offerSendID } = data;
    console.log('get offer');
    if (!localStreamRef) return;
    const pc = createPeerConnection(offerSendID);
    if (!(pc && socketRef)) return;
    pcsRef = { ...pcsRef, [offerSendID]: pc };
    try {
      // 로컬 피어 등록
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('answer set remote description success');
      const localSdp = await pc.createAnswer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true
      });
      // 원격 피어 등록하고 로컬 피어를 전달
      await pc.setLocalDescription(new RTCSessionDescription(localSdp));
      socketRef.emit('answer', {
        sdp: localSdp,
        answerSendID: socketRef.id,
        answerReceiveID: offerSendID
      });
    } catch (e) {
      console.error(e);
    }
  });

  // 접속 허가를 받은 경우
  socketRef.on('getAnswer', (data) => {
    const { sdp, answerSendID } = data;
    console.log('get answer');
    const pc = pcsRef[answerSendID];
    if (!pc) return;
    // 원격 피어 등록
    pc.setRemoteDescription(new RTCSessionDescription(sdp));
  });

  // 요청 등록이 온 경우
  socketRef.on('getCandidate', async (data) => {
    console.log('get candidate');
    const pc = pcsRef[data.candidateSendID];
    if (!pc) return;
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    console.log('candidate add success');
  });

  // 특정 유저가 나간 경우
  socketRef.on('userExit', (data) => {
    // 해당 피어가 존재하면 제거
    if (!pcsRef[data.id]) return;
    pcsRef[data.id].close();
    delete pcsRef[data.id];
  });

  async function getLocalStream() {
    try {
      // 로컬 스트림 획득
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      localStreamRef = localStream;
      if (!socketRef) return;
      // 방에 참여
      socketRef.emit('joinRoom', {
        room: DEVICE_ID
      });
    } catch (e) {
      console.log(`getUserMedia error: ${e}`);
    }
  }

  function createPeerConnection(socketID) {
    try {
      const pc = new RTCPeerConnection(PC_CONFIG);

      pc.onicecandidate = (e) => {
        if (!(socketRef && e.candidate)) return;
        console.log('onicecandidate');
        socketRef.emit('candidate', {
          candidate: e.candidate,
          candidateSendID: socketRef.id,
          candidateReceiveID: socketID
        });
      };

      pc.oniceconnectionstatechange = (e) => {
        console.log(e);
      };

      pc.ontrack = (e) => {
        console.log('ontrack success');
      };

      if (localStreamRef) {
        console.log('localstream add');
        // 피어에 로컬 스트림을 등록
        localStreamRef.getTracks().forEach((track) => {
          if (!localStreamRef) return;
          pc.addTrack(track, localStreamRef);
        });
      } else {
        console.log('no local stream');
      }

      return pc;
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }
}
