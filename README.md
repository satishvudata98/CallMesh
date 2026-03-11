# Simple 1-to-1 Video Call App

A very small peer-to-peer audio/video calling app for personal use by two users only.

## Features

- Choose audio call or video call from the home screen
- Join a room with a room ID
- Maximum two users per room
- WebRTC audio/video calling
- WebRTC audio-only calling
- Local and remote video display
- Mute/unmute microphone
- Turn camera on/off
- Leave call
- No authentication
- No database

## Project Structure

```text
video-call-app/
  client/
    index.html
    style.css
    app.js
  server/
    server.js
  package.json
  README.md
```

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript, WebRTC
- Backend: Node.js, WebSocket (`ws`)
- STUN server: `stun:stun.l.google.com:19302`

## How It Works

1. Two users open the app.
2. Both choose the same call type: audio or video.
3. Both enter the same room ID.
4. The Node.js WebSocket server exchanges signaling data:
   - SDP offer
   - SDP answer
   - ICE candidates
5. Once signaling is complete, audio or audio/video media flows directly between browsers with WebRTC.

Rooms are mode-specific:

- an audio room can only be joined as an audio call
- a video room can only be joined as a video call

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

```bash
npm start
```

### 3. Open the app

Open this URL in two browser tabs or on two different devices:

```text
http://localhost:3000
```

For testing from your phone on the same Wi-Fi, use:

```text
http://YOUR-PC-IPV4:3000
```

### 4. Start a call

1. Choose `Audio Call` or `Video Call` on the home screen.
2. Enter the same room ID on both devices.
3. Click `Start Audio Call` or `Start Video Call`.

## Notes for Local Testing

- Allow camera and microphone access in both browsers.
- For two real users, use two devices on the same or different networks.
- Without a TURN server, calls may fail on restrictive networks. This is expected for a STUN-only setup.

## Testing From Mobile On Your Local Network

The server listens on `0.0.0.0`, so other devices on your Wi-Fi can access it.

### Find your PC IPv4 address on Windows

Run:

```bash
ipconfig
```

Look for the active Wi-Fi adapter and copy the `IPv4 Address`, for example:

```text
192.168.1.25
```

Then open this on your phone:

```text
http://192.168.1.25:3000
```

### If the phone cannot open the page

Check these items:

- Both phone and PC are on the same Wi-Fi network
- You are using the correct IPv4 address from `ipconfig`
- Windows Firewall is allowing Node.js on private networks
- Your router does not have AP isolation or client isolation enabled

### Important mobile browser note

Many mobile browsers block `camera` and `microphone` access on plain HTTP LAN URLs such as:

```text
http://192.168.1.25:3000
```

This means:

- the page may open successfully
- but `getUserMedia()` can still fail on the phone
- and you may see an error like `Cannot read properties of undefined (reading 'getUserMedia')`

For a proper phone audio/video test, use HTTPS by deploying the app or tunneling it through a secure public URL.

## Free Deployment Options

## Deploy the Signaling Server

You can deploy the `server/` app to any free Node.js host:

- Render
- Railway
- Fly.io

The server uses `process.env.PORT`, so it is ready for these platforms.

### Render

1. Push the project to GitHub.
2. Create a new Web Service on Render.
3. Set:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Deploy.
5. Your signaling server URL will look like:

```text
https://your-app.onrender.com
```

### Railway

1. Push the project to GitHub.
2. Create a new project from the repo.
3. Railway usually detects Node automatically.
4. Set the start command to:

```bash
npm start
```

### Fly.io

1. Install the Fly.io CLI.
2. Run:

```bash
fly launch
fly deploy
```

## Host the Frontend on Vercel or Netlify

The frontend is plain static files inside `client/`.

### Important

If the frontend is hosted on a different domain than the signaling server, set the signaling server URL in `client/index.html`.

Find this line:

```html
window.SIGNALING_SERVER_URL = window.SIGNALING_SERVER_URL || "";
```

Replace it with your deployed signaling server URL:

```html
window.SIGNALING_SERVER_URL = "wss://your-app.onrender.com";
```

Use `wss://` when your frontend is hosted over HTTPS.

### Vercel

1. Create a new project from your repo.
2. Set the root directory to `video-call-app/client` if needed.
3. Deploy as a static site.

### Netlify

1. Create a new site from your repo.
2. Set the publish directory to `video-call-app/client`.
3. Deploy.

## Beginner-Friendly Explanation

- `server/server.js` manages rooms and relays signaling messages between two browsers.
- `client/app.js` handles camera/mic access, WebRTC connection setup, and UI controls.
- `client/style.css` provides a simple responsive layout.

## Limitations

- Only two users per room
- No chat
- No screen sharing
- No TURN server
- Best for simple personal use

## Full File Summary

- `client/index.html`: page layout
- `client/style.css`: simple styling
- `client/app.js`: WebRTC and UI logic
- `server/server.js`: signaling server
- `package.json`: project metadata and dependency
