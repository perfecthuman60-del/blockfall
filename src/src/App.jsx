import React, { useEffect, useMemo, useRef, useState } from "react";

function Button({ children, className = "", size, variant, ...props }) {
  return <button className={`px-4 py-2 rounded-xl transition active:scale-95 ${className}`} {...props}>{children}</button>;
}

function Card({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

const W = 10;
const H = 20;
const EMPTY = "";

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};

const COLORS = {
  I: "bg-cyan-400",
  O: "bg-yellow-400",
  T: "bg-purple-500",
  S: "bg-green-500",
  Z: "bg-red-500",
  J: "bg-blue-500",
  L: "bg-orange-500",
};

const MUSIC_TRACKS = [
  { name: "Calm Stars", tempo: 520, wave: "sine", notes: [262, 330, 392, 494, 523, 494, 392, 330, 294, 349, 440, 523, 440, 349, 294, 262] },
  { name: "Soft Night", tempo: 640, wave: "triangle", notes: [220, 277, 330, 415, 494, 415, 330, 277, 247, 311, 370, 466, 370, 311, 247, 220] },
  { name: "Ocean Blocks", tempo: 720, wave: "sine", notes: [196, 247, 294, 392, 440, 392, 294, 247, 220, 262, 330, 392, 330, 262, 220, 196] },
  { name: "Retro Chill", tempo: 460, wave: "square", notes: [330, 392, 494, 659, 587, 494, 392, 330, 349, 440, 523, 698, 622, 523, 440, 349] },
];

function blankBoard() {
  return Array.from({ length: H }, () => Array(W).fill(EMPTY));
}

function randomPiece() {
  const keys = Object.keys(SHAPES);
  const type = keys[Math.floor(Math.random() * keys.length)];
  return { type, shape: SHAPES[type], x: 3, y: 0 };
}

function rotate(shape) {
  return shape[0].map((_, i) => shape.map(row => row[i]).reverse());
}

function collides(board, piece, dx = 0, dy = 0, nextShape = piece.shape) {
  for (let y = 0; y < nextShape.length; y++) {
    for (let x = 0; x < nextShape[y].length; x++) {
      if (!nextShape[y][x]) continue;
      const nx = piece.x + x + dx;
      const ny = piece.y + y + dy;
      if (nx < 0 || nx >= W || ny >= H) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function merge(board, piece) {
  const next = board.map(r => [...r]);
  piece.shape.forEach((row, y) => row.forEach((v, x) => {
    if (v && piece.y + y >= 0) next[piece.y + y][piece.x + x] = piece.type;
  }));
  return next;
}

function clearLines(board) {
  const kept = board.filter(row => row.some(cell => !cell));
  const cleared = H - kept.length;
  while (kept.length < H) kept.unshift(Array(W).fill(EMPTY));
  return { board: kept, cleared };
}

export default function Tetris() {
  const touchStart = useRef(null);
  const audioRef = useRef(null);
  const [board, setBoard] = useState(blankBoard);
  const [piece, setPiece] = useState(randomPiece);
  const [nextPiece, setNextPiece] = useState(randomPiece);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [trackIndex, setTrackIndex] = useState(0);
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem("blockfallBestScore")) || 0);
  const [gameStarted, setGameStarted] = useState(false);
  const tickRef = useRef(null);

  const speed = Math.max(120, 650 - Math.floor(lines / 5) * 70);

  const playSound = (type = "move") => {
    if (!soundOn) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = audioRef.current || new AudioContext();
    audioRef.current = ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = { move: 220, rotate: 330, drop: 140, clear: 520, over: 90 }[type];
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  };

  const playMusicNote = () => {
    if (!musicOn || !soundOn || paused || gameOver) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = audioRef.current || new AudioContext();
    audioRef.current = ctx;

    const track = MUSIC_TRACKS[trackIndex];
    const note = track.notes[Math.floor(Date.now() / track.tempo) % track.notes.length];
    const harmony = note / 2;

    [note, harmony].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = track.wave;
      gain.gain.setValueAtTime(i === 0 ? 0.025 : 0.012, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + track.tempo / 1000 - 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + track.tempo / 1000 - 0.03);
    });
  };

  const visible = useMemo(() => {
    const v = board.map(r => [...r]);
    piece.shape.forEach((row, y) => row.forEach((cell, x) => {
      if (cell && piece.y + y >= 0) v[piece.y + y][piece.x + x] = piece.type;
    }));
    return v;
  }, [board, piece]);

  const spawn = (b, np = nextPiece) => {
    const newPiece = { ...np, x: 3, y: 0 };
    const freshNext = randomPiece();
    setPiece(newPiece);
    setNextPiece(freshNext);
    if (collides(b, newPiece)) {
      setGameOver(true);
      setBestScore(b => {
        const nextBest = Math.max(b, score);
        localStorage.setItem("blockfallBestScore", String(nextBest));
        return nextBest;
      });
      playSound("over");
    }
  };

  const drop = () => {
    if (!gameStarted || paused || gameOver) return;
    setPiece(p => {
      if (!collides(board, p, 0, 1)) return { ...p, y: p.y + 1 };
      const merged = merge(board, p);
      const res = clearLines(merged);
      setBoard(res.board);
      if (res.cleared) {
        playSound("clear");
        setLines(l => l + res.cleared);
        setScore(s => s + [0, 100, 300, 500, 800][res.cleared]);
      } else {
        playSound("drop");
      }
      setTimeout(() => spawn(res.board), 0);
      return p;
    });
  };

  const move = dx => setPiece(p => {
    if (collides(board, p, dx, 0)) return p;
    playSound("move");
    return { ...p, x: p.x + dx };
  });

  const hardDrop = () => setPiece(p => {
    let y = p.y;
    while (!collides(board, { ...p, y }, 0, 1)) y++;
    playSound("drop");
    return { ...p, y };
  });

  const spin = () => setPiece(p => {
    const r = rotate(p.shape);
    if (collides(board, p, 0, 0, r)) return p;
    playSound("rotate");
    return { ...p, shape: r };
  });

  const startAudio = () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = audioRef.current || new AudioContext();
    audioRef.current = ctx;
    if (ctx.state === "suspended") ctx.resume();
  };

  const handleTouchStart = e => {
    startAudio();
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = e => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < 25) spin();
    else if (ax > ay && dx > 0) move(1);
    else if (ax > ay && dx < 0) move(-1);
    else if (ay > ax && dy > 0) drop();
    else if (ay > ax && dy < 0) hardDrop();
    touchStart.current = null;
  };

  const restart = () => {
    setBoard(blankBoard());
    setPiece(randomPiece());
    setNextPiece(randomPiece());
    setScore(0);
    setLines(0);
    setPaused(false);
    setGameOver(false);
    setGameStarted(true);
  };

  const startGame = () => {
    startAudio();
    restart();
    setSettingsOpen(false);
  };

  useEffect(() => {
    setMusicOn(true);
    setSoundOn(true);
    startAudio();

    const unlockAudio = () => startAudio();
    window.addEventListener("click", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    const onKey = e => {
      if (e.key === "ArrowLeft") move(-1);
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowDown") drop();
      if (e.key === "ArrowUp") spin();
      if (e.code === "Space") hardDrop();
      if (e.key.toLowerCase() === "p") setPaused(p => !p);
      if (e.key.toLowerCase() === "s") setSettingsOpen(s => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(drop, speed);
    return () => clearInterval(tickRef.current);
  });

  useEffect(() => {
    if (!musicOn || !soundOn) return;
    const track = MUSIC_TRACKS[trackIndex];
    const id = setInterval(playMusicNote, track.tempo);
    return () => clearInterval(id);
  }, [musicOn, soundOn, paused, gameOver, trackIndex]);

  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 select-none touch-none">
        <Card className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 border-white/20 shadow-2xl rounded-3xl w-full max-w-md">
          <CardContent className="p-6 space-y-5 text-center">
            <h1 className="text-5xl font-black text-white tracking-wide drop-shadow-lg">BlockFall</h1>
            <p className="text-white/90 font-bold">Calm falling blocks puzzle</p>
            <Button className="w-full h-16 text-2xl bg-emerald-600 hover:bg-emerald-500 text-white border-2 border-white/40 font-black shadow-xl rounded-2xl" onClick={startGame}>START</Button>
            <Button className="w-full h-14 text-xl bg-white/15 hover:bg-white/25 text-white border border-white/30 font-black shadow rounded-2xl" onClick={() => { startAudio(); setSettingsOpen(s => !s); }}>SETTINGS</Button>
            {settingsOpen && (
              <div className="bg-white/10 rounded-2xl p-4 space-y-3 border border-white/20 shadow-lg">
                <p className="font-black text-white text-xl tracking-wide drop-shadow">Settings</p>
                <Button className="w-full bg-white/15 hover:bg-white/25 text-white border border-white/30 font-bold" onClick={() => setSoundOn(v => !v)}>Sound: {soundOn ? "On" : "Off"}</Button>
                <Button className="w-full bg-white/15 hover:bg-white/25 text-white border border-white/30 font-bold" onClick={() => { startAudio(); setMusicOn(v => !v); }}>Music: {musicOn ? "On" : "Off"}</Button>
                <div className="grid gap-2">
                  <p className="text-sm font-black text-white tracking-wide drop-shadow">Music menu:</p>
                  {MUSIC_TRACKS.map((track, i) => (
                    <Button key={track.name} className={`w-full text-white border border-white/30 font-bold shadow ${trackIndex === i ? "bg-purple-600 hover:bg-purple-500" : "bg-white/15 hover:bg-white/25"}`} onClick={() => setTrackIndex(i)}>{track.name}</Button>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-yellow-500 border-2 border-white/60 rounded-xl p-3 text-center shadow-lg">
              <p className="text-sm font-black text-white tracking-widest drop-shadow">RECORD</p>
              <p className="text-3xl font-black text-white drop-shadow-lg">{bestScore}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 select-none touch-none">
      <Card className="bg-slate-900 border-slate-700 shadow-2xl rounded-2xl">
        <CardContent className="p-5 grid md:grid-cols-[auto_210px] gap-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-4xl font-black text-white tracking-wide drop-shadow-lg">BlockFall</h1>
              <Button size="sm" className="bg-white/15 hover:bg-white/25 text-white border border-white/30 font-bold shadow-md" onClick={() => { startAudio(); setSettingsOpen(s => !s); }}>Settings</Button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-emerald-600 border-2 border-white/60 rounded-xl p-3 text-center shadow-lg">
                <p className="text-sm font-black text-white tracking-widest drop-shadow">SCORE</p>
                <p className="text-3xl font-black text-white drop-shadow-lg">{score}</p>
              </div>
              <div className="bg-amber-500 border-2 border-white/60 rounded-xl p-3 text-center shadow-lg">
                <p className="text-sm font-black text-white tracking-widest drop-shadow">RECORD</p>
                <p className="text-3xl font-black text-white drop-shadow-lg">{Math.max(bestScore, score)}</p>
              </div>
            </div>
            <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="grid gap-[2px] bg-slate-800 p-2 rounded-xl" style={{ gridTemplateColumns: `repeat(${W}, 24px)` }}>
              {visible.flatMap((row, y) => row.map((cell, x) => (
                <div key={`${y}-${x}`} className={`w-6 h-6 rounded-sm ${cell ? COLORS[cell] : "bg-slate-700/60"}`} />
              )))}
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <Button className="h-20 text-4xl bg-white/15 hover:bg-white/25 text-white border-2 border-white/40 font-black shadow-xl rounded-2xl" onClick={() => { startAudio(); move(-1); }}>←</Button>
              <Button className="h-20 text-4xl bg-purple-600 hover:bg-purple-500 text-white border-2 border-white/40 font-black shadow-xl rounded-2xl" onClick={() => { startAudio(); spin(); }}>↻</Button>
              <Button className="h-20 text-4xl bg-white/15 hover:bg-white/25 text-white border-2 border-white/40 font-black shadow-xl rounded-2xl" onClick={() => { startAudio(); move(1); }}>→</Button>
              <Button className="h-16 col-span-3 text-xl bg-white/15 hover:bg-white/25 text-white border-2 border-white/40 font-black shadow-xl rounded-2xl" onClick={() => { startAudio(); drop(); }}>DOWN</Button>
              <Button className="h-16 col-span-3 text-xl bg-pink-600 hover:bg-pink-500 text-white border-2 border-white/40 font-black shadow-xl rounded-2xl" onClick={() => { startAudio(); hardDrop(); }}>HARD DROP</Button>
            </div>
          </div>

          <div className="space-y-4">
            {settingsOpen && (
              <div className="bg-slate-800 rounded-xl p-4 space-y-3 border border-white/20 shadow-lg">
                <p className="font-black text-white text-xl tracking-wide drop-shadow">Settings</p>
                <Button className="w-full bg-white/15 hover:bg-white/25 text-white border border-white/30 font-bold" onClick={() => setSoundOn(v => !v)}>
                  Sound: {soundOn ? "On" : "Off"}
                </Button>
                <Button className="w-full bg-white/15 hover:bg-white/25 text-white border border-white/30 font-bold" onClick={() => { startAudio(); setMusicOn(v => !v); }}>
                  Music: {musicOn ? "On" : "Off"}
                </Button>
                <div className="grid gap-2">
                  <p className="text-sm font-black text-white tracking-wide drop-shadow">Music menu:</p>
                  {MUSIC_TRACKS.map((track, i) => (
                    <Button key={track.name} className={`w-full text-white border border-white/30 font-bold shadow ${trackIndex === i ? "bg-purple-600 hover:bg-purple-500" : "bg-white/15 hover:bg-white/25"}`} onClick={() => setTrackIndex(i)}>
                      {track.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-slate-800 rounded-xl p-4 border border-white/20 shadow-lg text-white font-bold space-y-1">
              <p className="drop-shadow">Score: <b>{score}</b></p>
              <p className="drop-shadow">Record: <b>{Math.max(bestScore, score)}</b></p>
              <p className="drop-shadow">Lines: <b>{lines}</b></p>
              <p className="drop-shadow">Speed: <b>{speed}ms</b></p>
            </div>

            <div className="bg-slate-800 rounded-xl p-4 border border-white/20 shadow-lg">
              <p className="mb-2 font-black text-white text-lg tracking-wide drop-shadow">Next:</p>
              <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(4, 20px)` }}>
                {Array.from({ length: 16 }).map((_, i) => {
                  const y = Math.floor(i / 4), x = i % 4;
                  const filled = nextPiece.shape[y]?.[x];
                  return <div key={i} className={`w-5 h-5 rounded-sm ${filled ? COLORS[nextPiece.type] : "bg-slate-700/40"}`} />;
                })}
              </div>
            </div>

            {paused && !gameOver && <div className="text-xl font-black text-white bg-white/15 border border-white/30 rounded-xl p-3 text-center shadow-lg drop-shadow">Paused</div>}

            {gameOver && (
              <div className="bg-gradient-to-br from-indigo-700 via-purple-700 to-pink-700 rounded-2xl p-5 space-y-3 text-center border border-purple-300/40 shadow-xl">
                <p className="text-4xl font-black text-white tracking-wide drop-shadow-lg">Game Over</p>
                <div className="bg-white/15 rounded-xl p-3 space-y-1 border border-white/25 text-white font-bold shadow-inner">
                  <p className="drop-shadow">Final score: <b>{score}</b></p>
                  <p className="drop-shadow">Record: <b>{Math.max(bestScore, score)}</b></p>
                  <p className="drop-shadow">Lines cleared: <b>{lines}</b></p>
                </div>
                <Button className="w-full bg-white/20 text-white border border-white/40 hover:bg-white/30 font-black shadow-lg" onClick={restart}>Play Again</Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setPaused(p => !p)} className="h-12 bg-white/15 hover:bg-white/25 text-white border border-white/30 font-black shadow">Pause</Button>
              <Button onClick={restart} className="h-12 bg-white/15 hover:bg-white/25 text-white border border-white/30 font-black shadow">Restart</Button>
            </div>

            <p className="text-sm text-white font-semibold bg-white/10 border border-white/20 rounded-xl p-3 shadow drop-shadow">Controls are under the board. Tap to rotate, swipe left/right to move, down to drop, up for hard drop.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
