import { useEffect, useRef } from 'react';

interface GridNode {
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  phaseX: number;
  phaseY: number;
  speedX: number;
  speedY: number;
  isMainSubstation?: boolean;
}

interface ElectricalWave {
  rootX: number;
  rootY: number;
  radius: number;
  maxRadius: number;
  speed: number;
  alpha: number;
}

export function ParticleCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener('resize', handleResize);

    // 1. Durağan Şebeke Düğümleri (Grid Topology Anchors)
    const nodes: GridNode[] = [];
    const cols = Math.floor(width / 90);
    const rows = Math.floor(height / 90);

    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        // Izgara noktasına biraz organik rastgelelik ekle
        const anchorX = (c + 0.5) * (width / (cols + 1)) + (Math.random() - 0.5) * 30;
        const anchorY = (r + 0.5) * (height / (rows + 1)) + (Math.random() - 0.5) * 30;

        nodes.push({
          anchorX,
          anchorY,
          x: anchorX,
          y: anchorY,
          phaseX: Math.random() * Math.PI * 2,
          phaseY: Math.random() * Math.PI * 2,
          speedX: 0.003 + Math.random() * 0.002,
          speedY: 0.003 + Math.random() * 0.002,
          isMainSubstation: r === Math.floor(rows / 2) && c === Math.floor(cols / 3),
        });
      }
    }

    // 2. Elektrik Akım Dalgaları Listesi
    const waves: ElectricalWave[] = [];

    // Her 4.8 saniyede bir ana trafo merkezinden dışa doğru akıcı elektrik dalgası tetikle
    let lastWaveTime = Date.now();
    const triggerPowerPulse = () => {
      // Ana trafo düğümünü bul veya merkeze yakın bir nokta seç
      const mainNode = nodes.find((n) => n.isMainSubstation) || nodes[Math.floor(nodes.length / 2)];
      if (!mainNode) return;

      waves.push({
        rootX: mainNode.x,
        rootY: mainNode.y,
        radius: 0,
        maxRadius: Math.max(width, height) * 0.9,
        speed: 1.1, // Akış hızı yavaşlatıldı (Daha süzülen, ipeksi geçiş)
        alpha: 0.75,
      });
    };

    // İlk dalgayı hemen başlat
    triggerPowerPulse();

    let time = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.016;

      // 4.8 saniyede bir periyodik akıcı elektrik dalgası üret
      const now = Date.now();
      if (now - lastWaveTime > 4800) {
        triggerPowerPulse();
        lastWaveTime = now;
      }

      // A) Düğümleri güncelle (Yerinde çok hafif mikro salınım / mikro süzülme)
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.phaseX += n.speedX;
        n.phaseY += n.speedY;

        // Yerinden ayrılmadan hafif salınım (3-5px yarıçapında mikro hareket)
        n.x = n.anchorX + Math.sin(n.phaseX) * 4;
        n.y = n.anchorY + Math.cos(n.phaseY) * 4;
      }

      // B) Elektrik Akımı Dalga Cephelerini Güncelle
      for (let w = waves.length - 1; w >= 0; w--) {
        const wave = waves[w];
        wave.radius += wave.speed;
        wave.alpha = Math.max(0, 0.8 * (1 - wave.radius / wave.maxRadius));

        if (wave.radius >= wave.maxRadius || wave.alpha <= 0) {
          waves.splice(w, 1);
        }
      }

      // C) Şebeke İletim Hatlarını (Grid Mesh Lines) Çiz
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i];
          const n2 = nodes[j];
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 135) {
            // Çizginin orta noktasının akım dalga merkezine uzaklığı
            const midX = (n1.x + n2.x) / 2;
            const midY = (n1.y + n2.y) / 2;

            let waveBoost = 0;

            // Dalga bu çizgiden geçiyorsa renk parlaklığını yumuşakça artır (Elektrik Akımı Etkisi)
            for (const wave of waves) {
              const waveDist = Math.sqrt((midX - wave.rootX) ** 2 + (midY - wave.rootY) ** 2);
              const diff = Math.abs(waveDist - wave.radius);
              if (diff < 40) {
                const intensity = (1 - diff / 40) * wave.alpha;
                if (intensity > waveBoost) waveBoost = intensity;
              }
            }

            // Normalde çok sakin/saydam (#3eb875 opacity 0.12), dalga geçerken canlı yeşile dönüşür
            const baseAlpha = (1 - dist / 135) * 0.12;
            const finalAlpha = Math.min(0.75, baseAlpha + waveBoost * 0.65);
            const lineWidth = 0.7 + waveBoost * 1.0;

            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);

            if (waveBoost > 0.05) {
              // Dalga anında canlı pastel yeşil akım rengi
              ctx.strokeStyle = `rgba(62, 184, 117, ${finalAlpha})`;
            } else {
              // Sakin durum
              ctx.strokeStyle = `rgba(62, 184, 117, ${baseAlpha})`;
            }

            ctx.lineWidth = lineWidth;
            ctx.stroke();
          }
        }
      }

      // D) Şebeke Düğümlerini (Trafo & Dağıtım Noktalarını) Çiz
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];

        let nodeWaveBoost = 0;
        for (const wave of waves) {
          const d = Math.sqrt((n.x - wave.rootX) ** 2 + (n.y - wave.rootY) ** 2);
          const diff = Math.abs(d - wave.radius);
          if (diff < 35) {
            const intensity = (1 - diff / 35) * wave.alpha;
            if (intensity > nodeWaveBoost) nodeWaveBoost = intensity;
          }
        }

        const nodeRadius = 2 + nodeWaveBoost * 1.5;

        ctx.beginPath();
        ctx.arc(n.x, n.y, nodeRadius, 0, Math.PI * 2);

        if (nodeWaveBoost > 0.1) {
          ctx.fillStyle = `rgba(62, 184, 117, ${0.4 + nodeWaveBoost * 0.55})`;
        } else {
          ctx.fillStyle = 'rgba(62, 184, 117, 0.35)';
        }

        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} style={{ display: 'block', width: '100%', height: '100%' }} />;
}
