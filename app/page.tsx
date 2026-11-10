'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DraftOS } from '@/lib/kernel/draft_os';
import { WebGL2VGARenderer } from '@/lib/kernel/webgl_renderer';

export default function BareMetalKernelPage() {
  const [os] = useState<DraftOS>(() => {
    return new DraftOS();
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGL2VGARenderer | null>(null);
  const cursorBlinkRef = useRef<boolean>(true);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Render WebGL2 canvas frame
  const drawFrame = useCallback(() => {
    if (rendererRef.current && canvasRef.current) {
      rendererRef.current.render(
        os.cpu.getDisplayMemory(),
        os.cpu.cursorCol,
        os.cpu.cursorRow,
        cursorBlinkRef.current && os.cpu.scrollbackOffset === 0
      );
    }
  }, [os]);

  // Initialize WebGL2 Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new WebGL2VGARenderer();
    renderer.init(canvas);
    rendererRef.current = renderer;

    drawFrame();

    // Resize observer to keep high-DPI crispness
    const resizeCanvas = () => {
      drawFrame();
    };

    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [drawFrame]);

  // Hardware PIT Timer tick (18.2Hz simulated with 500ms blink / 50ms ticks)
  useEffect(() => {
    const timer = setInterval(() => {
      os.tickTimer();
      drawFrame();
    }, 50);

    const blinkTimer = setInterval(() => {
      cursorBlinkRef.current = !cursorBlinkRef.current;
      drawFrame();
    }, 400);

    return () => {
      clearInterval(timer);
      clearInterval(blinkTimer);
    };
  }, [os, drawFrame]);

  // Physical Keyboard hardware interrupt listener (IRQ 1 / Port 0x60)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['Alt', 'Control', 'Meta'].includes(e.key)) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        return;
      }

      if (e.key === 'PageUp') {
        e.preventDefault();
        os.cpu.pageUp(12);
        drawFrame();
        return;
      }

      if (e.key === 'PageDown') {
        e.preventDefault();
        os.cpu.pageDown(12);
        drawFrame();
        return;
      }

      // If user presses other keys while scrolled up, reset scroll to bottom
      if (os.cpu.scrollbackOffset > 0 && !['Shift', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        os.cpu.resetScroll();
      }

      os.handleKeyDown(e.key, e.keyCode || e.which);
      drawFrame();

      if ([' ', 'Backspace', 'ArrowUp', 'ArrowDown', 'Enter', 'PageUp', 'PageDown'].includes(e.key)) {
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      os.handleKeyUp(e.key);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [os, drawFrame]);

  const handleCanvasClick = () => {
    hiddenInputRef.current?.focus();
  };

  return (
    <div
      onClick={handleCanvasClick}
      className="w-screen h-screen bg-black flex items-center justify-center overflow-hidden cursor-text select-none m-0 p-0"
    >
      {/* Hidden input for mobile virtual keyboard */}
      <input
        ref={hiddenInputRef}
        type="text"
        aria-label="Keyboard Input"
        className="opacity-0 absolute pointer-events-none w-0 h-0"
      />

      {/* Pure WebGL2 VGA Screen (Exact 80x25 Cells @ 8x16 Font -> 640x400 Native Pixels) */}
      <canvas
        ref={canvasRef}
        width={640}
        height={400}
        className="max-w-[100vw] max-h-[100vh] object-contain"
        style={{
          aspectRatio: '640 / 400',
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
