const fs = require("fs");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const clientDirectory = path.join(__dirname, "..", "client");

// Each room holds at most two connected WebSocket clients and one call mode.
const rooms = new Map();

function sendMessage(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getMimeType(filePath) {
  const extension = path.extname(filePath);

  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    default:
      return "text/plain; charset=utf-8";
  }
}

function serveClientFile(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const relativePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const filePath = path.resolve(clientDirectory, relativePath);
  const relativeFilePath = path.relative(clientDirectory, filePath);

  if (relativeFilePath.startsWith("..") || path.isAbsolute(relativeFilePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, fileContent) => {
    if (error) {
      response.writeHead(404);
      response.end("File not found");
      return;
    }

    response.writeHead(200, { "Content-Type": getMimeType(filePath) });
    response.end(fileContent);
  });
}

function removeFromRoom(ws, notifyPeer = true) {
  if (!ws.roomId) {
    return;
  }

  const room = rooms.get(ws.roomId);

  if (!room) {
    ws.roomId = null;
    return;
  }

  room.peers.delete(ws);

  if (room.peers.size === 0) {
    rooms.delete(ws.roomId);
  } else if (notifyPeer) {
    room.peers.forEach((peer) => {
      sendMessage(peer, { type: "peer-left" });
    });
  }

  ws.roomId = null;
}

function relayToPeer(ws, payload) {
  if (!ws.roomId) {
    return;
  }

  const room = rooms.get(ws.roomId);

  if (!room) {
    return;
  }

  room.peers.forEach((peer) => {
    if (peer !== ws) {
      sendMessage(peer, payload);
    }
  });
}

function joinRoom(ws, roomId, mode) {
  const normalizedRoomId = typeof roomId === "string" ? roomId.trim() : "";
  const normalizedMode = mode === "audio" || mode === "video" ? mode : "";

  if (!normalizedRoomId) {
    sendMessage(ws, { type: "error", message: "A room ID is required." });
    return;
  }

  if (!normalizedMode) {
    sendMessage(ws, { type: "error", message: "Choose audio or video before joining." });
    return;
  }

  if (ws.roomId) {
    removeFromRoom(ws);
  }

  let room = rooms.get(normalizedRoomId);

  if (!room) {
    room = {
      mode: normalizedMode,
      peers: new Set(),
    };
    rooms.set(normalizedRoomId, room);
  }

  if (room.mode !== normalizedMode) {
    sendMessage(ws, {
      type: "error",
      message: `This room is already being used for a ${room.mode} call.`,
    });
    return;
  }

  if (room.peers.size >= 2) {
    sendMessage(ws, {
      type: "full",
      message: "This room already has two people.",
    });
    return;
  }

  room.peers.add(ws);
  ws.roomId = normalizedRoomId;

  sendMessage(ws, {
    type: "joined",
    roomId: normalizedRoomId,
    mode: room.mode,
  });

  if (room.peers.size === 2) {
    const [firstPeer, secondPeer] = Array.from(room.peers);

    // The first peer creates the offer. The second waits for it.
    sendMessage(firstPeer, { type: "ready", shouldCreateOffer: true, mode: room.mode });
    sendMessage(secondPeer, {
      type: "ready",
      shouldCreateOffer: false,
      mode: room.mode,
    });
  }
}

const server = http.createServer(serveClientFile);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  ws.roomId = null;

  ws.on("message", (rawMessage) => {
    let message;

    try {
      message = JSON.parse(rawMessage);
    } catch (error) {
      sendMessage(ws, { type: "error", message: "Invalid JSON message." });
      return;
    }

    switch (message.type) {
      case "join":
        joinRoom(ws, message.roomId, message.mode);
        break;

      case "offer":
      case "answer":
      case "ice-candidate":
        relayToPeer(ws, message);
        break;

      case "leave":
        removeFromRoom(ws);
        break;

      default:
        sendMessage(ws, { type: "error", message: "Unknown message type." });
        break;
    }
  });

  ws.on("close", () => {
    removeFromRoom(ws);
  });

  ws.on("error", () => {
    removeFromRoom(ws);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`LAN access: http://<your-local-ip>:${PORT}`);
});
