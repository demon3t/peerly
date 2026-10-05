import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

/**
 * Window-wide drag & drop. Reports absolute paths of dropped files/folders.
 * Returns whether something is currently being dragged over the window.
 */
export function useFileDrop(onDrop) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const enter = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const leave = (event) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const over = (event) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const drop = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const paths = Array.from(event.dataTransfer.files || [])
        .map((file) => api.pathForFile(file))
        .filter(Boolean);
      if (paths.length) onDropRef.current(paths);
    };

    const events = { dragenter: enter, dragleave: leave, dragover: over, drop };
    Object.entries(events).forEach(([name, fn]) => window.addEventListener(name, fn));
    return () => Object.entries(events).forEach(([name, fn]) => window.removeEventListener(name, fn));
  }, []);

  return dragging;
}
