"use client";

import { useEffect, useRef } from 'react';

export default function FloatingParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();

    // Orb class for floating gradient orbs
    class FloatingOrb {
      x: number;
      y: number;
      baseRadius: number;
      radius: number;
      vx: number;
      vy: number;
      phase: number;
      color: string;
      opacity: number;

      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.baseRadius = 60 + Math.random() * 80;
        this.radius = this.baseRadius;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.phase = Math.random() * Math.PI * 2;
        this.color = `hsl(${210 + Math.random() * 30}, ${20 + Math.random() * 20}%, ${10 + Math.random() * 15}%)`;
        this.opacity = 0.15 + Math.random() * 0.1;
      }

      update(time: number) {
        this.x += this.vx;
        this.y += this.vy;
        this.radius = this.baseRadius + Math.sin(time * 0.001 + this.phase) * 10;

        // Wrap around screen edges
        if (this.x < -this.radius) this.x = canvas.width + this.radius;
        if (this.x > canvas.width + this.radius) this.x = -this.radius;
        if (this.y < -this.radius) this.y = canvas.height + this.radius;
        if (this.y > canvas.height + this.radius) this.y = -this.radius;
      }

      draw() {
        const gradient = ctx.createRadialGradient(
          this.x, this.y, 0,
          this.x, this.y, this.radius
        );
        gradient.addColorStop(0, `hsla(${210 + Math.sin(this.phase) * 20}, 30%, 40%, ${this.opacity})`);
        gradient.addColorStop(0.6, `hsla(${230 + Math.cos(this.phase) * 15}, 25%, 25%, ${this.opacity * 0.3})`);
        gradient.addColorStop(1, 'hsla(0, 0%, 0%, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(
          this.x - this.radius,
          this.y - this.radius,
          this.radius * 2,
          this.radius * 2
        );
      }
    }

    // Dot class for minimal floating dots
    class FloatingDot {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
      phase: number;

      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = 1 + Math.random() * 2;
        this.opacity = 0.3 + Math.random() * 0.4;
        this.phase = Math.random() * Math.PI * 2;
      }

      update(time: number) {
        this.x += this.vx;
        this.y += this.vy;
        this.opacity = (0.3 + Math.sin(time * 0.002 + this.phase) * 0.3);

        // Wrap around screen edges
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;
      }

      draw() {
        ctx.fillStyle = `hsla(0, 0%, 60%, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Create orbs and dots
    const orbs: FloatingOrb[] = [];
    const dots: FloatingDot[] = [];

    for (let i = 0; i < 8; i++) {
      orbs.push(new FloatingOrb());
    }

    for (let i = 0; i < 50; i++) {
      dots.push(new FloatingDot());
    }

    // Animation loop
    const animate = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw orbs
      orbs.forEach(orb => {
        orb.update(time);
        orb.draw();
      });

      // Draw dots
      dots.forEach(dot => {
        dot.update(time);
        dot.draw();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    animate(0);

    // Handle window resize
    const handleResize = () => {
      resizeCanvas();
      // Reposition elements on resize
      orbs.forEach(orb => {
        orb.x = Math.min(orb.x, canvas.width);
        orb.y = Math.min(orb.y, canvas.height);
      });
      dots.forEach(dot => {
        dot.x = Math.min(dot.x, canvas.width);
        dot.y = Math.min(dot.y, canvas.height);
      });
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{
        zIndex: -1,
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
      }}
    />
  );
}