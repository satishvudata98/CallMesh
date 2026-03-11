const appElement = document.getElementById("app");
const homeScreen = document.getElementById("homeScreen");
const callScreen = document.getElementById("callScreen");
const audioModeButton = document.getElementById("audioModeButton");
const videoModeButton = document.getElementById("videoModeButton");
const selectedModeLabel = document.getElementById("selectedModeLabel");
const roomInput = document.getElementById("roomInput");
const joinButton = document.getElementById("joinButton");
const homeStatus = document.getElementById("homeStatus");
const callModeBadge = document.getElementById("callModeBadge");
const callRoomLabel = document.getElementById("callRoomLabel");
const callStatus = document.getElementById("callStatus");
const remoteVideo = document.getElementById("remoteVideo");
const localPreview = document.getElementById("localPreview");
const localVideo = document.getElementById("localVideo");
const audioVisual = document.getElementById("audioVisual");
const waitingOverlay = document.getElementById("waitingOverlay");
const waitingTitle = document.getElementById("waitingTitle");
const waitingText = document.getElementById("waitingText");
const toggleMicButton = document.getElementById("toggleMicButton");
const toggleCameraButton = document.getElementById("toggleCameraButton");
const leaveButton = document.getElementById("leaveButton");

const screenMap = {
  home: homeScreen,
  call: callScreen,
};

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const mediaConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 2,
    sampleRate: 48000,
    sampleSize: 16,
  },
};

let socket = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentRoomId = "";
let isJoined = false;
let isJoining = false;
let selectedCallMode = null;

function getModeLabel(mode = selectedCallMode) {
  return mode === "audio" ? "Audio Call" : "Video Call";
}

function getMediaSupportError() {
  if (!window.isSecureContext) {
    return new Error(
      "Camera and microphone access needs HTTPS on mobile. Open this app from a secure URL."
    );
  }

  return new Error(
    "This browser does not support camera or microphone access through navigator.mediaDevices."
  );
}

function getSignalingServerUrl() {
  const configuredUrl = window.SIGNALING_SERVER_URL?.trim();

  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}`;
}

function showScreen(screenName) {
  Object.entries(screenMap).forEach(([name, element]) => {
    const isActive = name === screenName;
    element.hidden = !isActive;
    element.setAttribute("aria-hidden", String(!isActive));
  });

  appElement.dataset.screen = screenName;
}

function setCallState(state) {
  appElement.dataset.callState = state;
}

function setStatus(message) {
  homeStatus.textContent = message;
  callStatus.textContent = message;
}

function setWaitingMessage(title, detail) {
  waitingTitle.textContent = title;
  waitingText.textContent = detail;
  waitingOverlay.hidden = false;
}

function hideWaitingMessage() {
  waitingOverlay.hidden = true;
}

function setControlsEnabled(enabled) {
  toggleMicButton.disabled = !enabled;
  toggleCameraButton.disabled = !enabled || selectedCallMode !== "video";
  leaveButton.disabled = !enabled;
}

function updateMediaButtonLabels() {
  const audioEnabled = localStream
    ? localStream.getAudioTracks().some((track) => track.enabled)
    : false;
  const videoEnabled = localStream
    ? localStream.getVideoTracks().some((track) => track.enabled)
    : false;

  toggleMicButton.textContent = audioEnabled ? "Mute" : "Unmute";
  toggleCameraButton.textContent =
    selectedCallMode === "video" && videoEnabled ? "Camera Off" : "Camera On";
}

function setModeButtonsDisabled(disabled) {
  audioModeButton.disabled = disabled;
  videoModeButton.disabled = disabled;
}

function updateJoinButtonState() {
  joinButton.disabled = !selectedCallMode || !roomInput.value.trim() || isJoined || isJoining;
}

function updateHomeUI() {
  appElement.dataset.mode = selectedCallMode || "none";
  audioModeButton.classList.toggle("active", selectedCallMode === "audio");
  videoModeButton.classList.toggle("active", selectedCallMode === "video");

  if (!selectedCallMode) {
    selectedModeLabel.textContent = "No mode selected";
    roomInput.disabled = true;
    roomInput.placeholder = "Select audio or video first";
    joinButton.textContent = "Start Call";
    updateJoinButtonState();
    return;
  }

  const modeLabel = getModeLabel();
  selectedModeLabel.textContent = modeLabel;
  roomInput.disabled = false;
  roomInput.placeholder = `Enter room ID for ${modeLabel.toLowerCase()}`;
  joinButton.textContent = `Start ${modeLabel}`;
  updateJoinButtonState();
}

function updateCallScreen() {
  const modeLabel = selectedCallMode ? getModeLabel() : "Call";

  callModeBadge.textContent = modeLabel;
  callRoomLabel.textContent = currentRoomId ? `Room ${currentRoomId}` : "Room";
  audioVisual.hidden = selectedCallMode !== "audio";
  localPreview.hidden = selectedCallMode !== "video";
  toggleCameraButton.hidden = selectedCallMode !== "video";
  updateMediaButtonLabels();
}

function setCallMode(mode) {
  if (isJoined || isJoining) {
    return;
  }

  selectedCallMode = mode;
  updateHomeUI();
  setStatus(`${getModeLabel(mode)} selected. Enter a room ID to continue.`);
  roomInput.focus();
}

function getMediaConstraints(mode) {
  return {
    video:
      mode === "video"
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          }
        : false,
    audio: mediaConstraints.audio,
  };
}

async function optimizeAudioSenders(pc) {
  const senderUpdates = pc.getSenders().map(async (sender) => {
    if (!sender.track || sender.track.kind !== "audio") {
      return;
    }

    sender.track.contentHint = "speech";

    if (!sender.getParameters || !sender.setParameters) {
      return;
    }

    const parameters = sender.getParameters();
    parameters.encodings = parameters.encodings || [{}];
    parameters.encodings[0].maxBitrate = 128000;

    try {
      await sender.setParameters(parameters);
    } catch (error) {
      console.warn("Audio sender optimization was skipped by the browser.", error);
    }
  });

  await Promise.all(senderUpdates);
}

async function startLocalMedia() {
  if (localStream) {
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw getMediaSupportError();
  }

  localStream = await navigator.mediaDevices.getUserMedia(
    getMediaConstraints(selectedCallMode)
  );

  localStream.getAudioTracks().forEach((track) => {
    track.contentHint = "speech";
  });

  localVideo.srcObject = selectedCallMode === "video" ? localStream : null;
  updateMediaButtonLabels();
}

function stopLocalMedia() {
  if (!localStream) {
    return;
  }

  localStream.getTracks().forEach((track) => track.stop());
  localVideo.srcObject = null;
  localStream = null;
}

function closePeerConnection() {
  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.ontrack = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.close();
    peerConnection = null;
  }

  remoteStream = null;
  remoteVideo.srcObject = null;
}

function disconnectSocket() {
  if (!socket) {
    return;
  }

  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;

  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close();
  }

  socket = null;
}

function resetToHomeState() {
  isJoined = false;
  isJoining = false;
  currentRoomId = "";
  selectedCallMode = null;
  closePeerConnection();
  disconnectSocket();
  stopLocalMedia();
  setCallState("idle");
  setModeButtonsDisabled(false);
  roomInput.value = "";
  setControlsEnabled(false);
  hideWaitingMessage();
  updateHomeUI();
  updateCallScreen();
  setStatus("Ready.");
  showScreen("home");
}

function sendMessage(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

async function createPeerConnection() {
  if (peerConnection) {
    return peerConnection;
  }

  peerConnection = new RTCPeerConnection(rtcConfig);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  await optimizeAudioSenders(peerConnection);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendMessage({
        type: "ice-candidate",
        candidate: event.candidate,
      });
    }
  };

  peerConnection.ontrack = (event) => {
    if (!event.streams[0]) {
      return;
    }

    const existingTrackIds = new Set(remoteStream.getTracks().map((track) => track.id));

    event.streams[0].getTracks().forEach((track) => {
      if (!existingTrackIds.has(track.id)) {
        remoteStream.addTrack(track);
      }
    });

    setCallState("connected");
    hideWaitingMessage();
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;

    if (state === "connected") {
      setCallState("connected");
      setStatus(`Connected in room "${currentRoomId}".`);
      hideWaitingMessage();
    }

    if (state === "disconnected" || state === "failed" || state === "closed") {
      setCallState("waiting");
      setStatus("The other person disconnected. Waiting for someone to join...");
      closePeerConnection();
      setWaitingMessage(
        "Call paused",
        "The other person left. Stay on this screen while they rejoin the same room."
      );
    }
  };

  return peerConnection;
}

async function createAndSendOffer() {
  const pc = await createPeerConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  sendMessage({
    type: "offer",
    offer,
  });
}

function waitForSocketConnection(ws) {
  return new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("Could not connect to the signaling server."));
  });
}

async function handleServerMessage(message) {
  switch (message.type) {
    case "joined":
      isJoined = true;
      isJoining = false;
      selectedCallMode = message.mode || selectedCallMode;
      setCallState("waiting");
      updateHomeUI();
      updateCallScreen();
      setControlsEnabled(true);
      setStatus(
        `Joined ${getModeLabel().toLowerCase()} room "${message.roomId}". Waiting for the second person...`
      );
      setWaitingMessage(
        "Waiting for your partner",
        selectedCallMode === "audio"
          ? "The audio call will start when the second person joins this room."
          : "The video call will start when the second person joins this room."
      );
      break;

    case "ready":
      selectedCallMode = message.mode || selectedCallMode;
      setCallState("joining");
      updateCallScreen();
      setStatus(`Both users are here. Starting the ${selectedCallMode} call...`);
      setWaitingMessage(
        selectedCallMode === "audio" ? "Connecting audio" : "Connecting video",
        "WebRTC is preparing the peer connection."
      );

      if (message.shouldCreateOffer) {
        await createAndSendOffer();
      } else {
        await createPeerConnection();
      }
      break;

    case "offer": {
      const pc = await createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendMessage({
        type: "answer",
        answer,
      });
      break;
    }

    case "answer":
      if (peerConnection) {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(message.answer)
        );
      }
      break;

    case "ice-candidate":
      if (peerConnection && message.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
      }
      break;

    case "peer-left":
      setCallState("waiting");
      setStatus("The other person left the room. Waiting for someone to join...");
      closePeerConnection();
      setWaitingMessage(
        "Call ended",
        "The other person left. Keep this room open if you want them to rejoin."
      );
      break;

    case "full":
      resetToHomeState();
      setStatus(message.message || "This room already has two users.");
      break;

    case "error":
      if (!isJoined) {
        resetToHomeState();
      }
      setStatus(message.message || "Something went wrong.");
      break;

    default:
      break;
  }
}

async function joinRoom() {
  const roomId = roomInput.value.trim();

  if (isJoining || isJoined) {
    return;
  }

  if (!selectedCallMode) {
    setStatus("Choose audio or video before joining a room.");
    return;
  }

  if (!roomId) {
    setStatus("Please enter a room ID.");
    return;
  }

  currentRoomId = roomId;
  isJoining = true;
  setCallState("joining");
  updateCallScreen();
  showScreen("call");
  joinButton.disabled = true;
  setModeButtonsDisabled(true);
  leaveButton.disabled = false;
  setWaitingMessage(
    selectedCallMode === "audio" ? "Starting audio setup" : "Starting video setup",
    selectedCallMode === "audio"
      ? "Requesting microphone access and joining the room."
      : "Requesting camera and microphone access and joining the room."
  );
  setStatus(
    selectedCallMode === "audio"
      ? "Starting microphone..."
      : "Starting camera and microphone..."
  );

  try {
    await startLocalMedia();

    socket = new WebSocket(getSignalingServerUrl());
    await waitForSocketConnection(socket);

    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      try {
        await handleServerMessage(message);
      } catch (error) {
        console.error(error);
        setCallState("waiting");
        setStatus("A WebRTC error occurred. Please leave and try again.");
        setWaitingMessage("Connection problem", "Leave the call and try joining again.");
      }
    };

    socket.onerror = () => {
      if (!isJoined) {
        resetToHomeState();
        setStatus("The signaling server connection failed.");
        return;
      }

      setCallState("waiting");
      setStatus("The signaling server connection failed.");
      setWaitingMessage(
        "Server connection failed",
        "The signaling server could not be reached. Try again in a moment."
      );
    };

    socket.onclose = () => {
      if (!isJoined && isJoining) {
        resetToHomeState();
        setStatus("Could not join the room.");
        return;
      }

      if (isJoined) {
        setCallState("waiting");
        setStatus("Disconnected from the signaling server.");
        setWaitingMessage(
          "Server disconnected",
          "You were disconnected from signaling. Leave and rejoin the room."
        );
      }
    };

    sendMessage({
      type: "join",
      roomId,
      mode: selectedCallMode,
    });
  } catch (error) {
    console.error(error);
    resetToHomeState();
    setStatus(error.message || "Could not access camera or microphone.");
  }
}

function leaveCall() {
  sendMessage({ type: "leave" });
  resetToHomeState();
}

function toggleMicrophone() {
  if (!localStream) {
    return;
  }

  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !track.enabled;
  });

  updateMediaButtonLabels();
}

function toggleCamera() {
  if (!localStream || selectedCallMode !== "video") {
    return;
  }

  localStream.getVideoTracks().forEach((track) => {
    track.enabled = !track.enabled;
  });

  updateMediaButtonLabels();
}

audioModeButton.addEventListener("click", () => setCallMode("audio"));
videoModeButton.addEventListener("click", () => setCallMode("video"));
joinButton.addEventListener("click", joinRoom);
toggleMicButton.addEventListener("click", toggleMicrophone);
toggleCameraButton.addEventListener("click", toggleCamera);
leaveButton.addEventListener("click", leaveCall);

roomInput.addEventListener("input", updateJoinButtonState);
roomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinRoom();
  }
});

window.addEventListener("beforeunload", () => {
  sendMessage({ type: "leave" });
});

resetToHomeState();
