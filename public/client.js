const PC_CONFIG = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    }
  ]
};
let part = window.location.href.split('/');
if (
  part.length > 1 &&
  part[part.length - 1] !== undefined &&
  part[part.length - 1] !== ''
) {
  const DEVICE_ID = part[part.length - 1];
  const SOCKET_SERVER_URL = `https://${DEVICE_ID}-cam.lt.thingbine.com`;
  const socketRef = io(SOCKET_SERVER_URL);
  const pcRef = new RTCPeerConnection(PC_CONFIG);

  socketRef.on('allUsers', (allUsers) => {
    if (allUsers.length > 0) {
      createOffer();
    }
  });

  socketRef.on('getOffer', (sdp) => {
    console.log('get offer');
    createAnswer(sdp);
  });

  socketRef.on('getAnswer', (sdp) => {
    console.log('get answer');
    if (!pcRef) return;
    pcRef.setRemoteDescription(new RTCSessionDescription(sdp));
  });

  socketRef.on('getCandidate', async (candidate) => {
    if (!pcRef) return;
    await pcRef.addIceCandidate(new RTCIceCandidate(candidate));
    console.log('candidate add success');
  });

  setVideoTracks();

  async function setVideoTracks() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      if (!(pcRef && socketRef)) return;
      stream.getTracks().forEach((track) => {
        if (!pcRef) return;
        pcRef.addTrack(track, stream);
      });
      pcRef.onicecandidate = (e) => {
        if (e.candidate) {
          if (!socketRef) return;
          console.log('onicecandidate');
          socketRef.emit('candidate', e.candidate);
        }
      };
      pcRef.oniceconnectionstatechange = (e) => {
        console.log(e);
      };
      pcRef.ontrack = (ev) => {
        console.log('add remotetrack success');
      };
      socketRef.emit('joinRoom', {
        room: DEVICE_ID
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function createOffer() {
    console.log('create offer');
    if (!(pcRef && socketRef)) return;
    try {
      const sdp = await pcRef.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pcRef.setLocalDescription(new RTCSessionDescription(sdp));
      socketRef.emit('offer', sdp);
    } catch (e) {
      console.error(e);
    }
  }

  async function createAnswer(sdp) {
    if (!(pcRef && socketRef)) return;
    try {
      await pcRef.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('answer set remote description success');
      const mySdp = await pcRef.createAnswer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true
      });
      console.log('create answer');
      await pcRef.setLocalDescription(new RTCSessionDescription(mySdp));
      socketRef.emit('answer', mySdp);
    } catch (e) {
      console.error(e);
    }
  }
}
