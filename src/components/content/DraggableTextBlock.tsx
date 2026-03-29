/**
 * DraggableTextBlock — A text block that can be freely repositioned via mouse drag.
 * Supports click-to-select for per-block editing controls.
 * Positions are stored as percentages (0–100) relative to the slide container.
 */

import { useCallback, useRef, useState } from "react";

export interface BlockPosition {
  x: number; // percentage left (0–100)
  y: number; // percentage top (0–100)
}

interface DraggableTextBlockProps {
  blockKey: string;
  position: BlockPosition;
  onPositionChange?: (key: string, pos: BlockPosition) => void;
  onSelect?: (key: string) => void;
  isSelected?: boolean;
  editable?: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function DraggableTextBlock({
  blockKey,
  position,
  onPositionChange,
  onSelect,
  isSelected = false,
  editable = false,
  containerRef,
  children,
  className,
  style,
}: DraggableTextBlockProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const didDrag = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      didDrag.current = false;

      if (!onPositionChange) {
        // No drag support, just select
        onSelect?.(blockKey);
        return;
      }

      setIsDragging(true);
      dragStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        startX: position.x,
        startY: position.y,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragStart.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const dx = ((ev.clientX - dragStart.current.mouseX) / rect.width) * 100;
        const dy = ((ev.clientY - dragStart.current.mouseY) / rect.height) * 100;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) didDrag.current = true;
        const newX = Math.max(0, Math.min(85, dragStart.current.startX + dx));
        const newY = Math.max(0, Math.min(90, dragStart.current.startY + dy));
        onPositionChange(blockKey, { x: newX, y: newY });
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        dragStart.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        // If it was a click (no drag), select the block
        if (!didDrag.current) {
          onSelect?.(blockKey);
        }
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [editable, onPositionChange, onSelect, position, blockKey, containerRef]
  );

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (editable) {
      e.stopPropagation();
    }
  }, [editable]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      className={className}
      style={{
        position: "absolute",
        left: `${position.x}%`,
        top: `${position.y}%`,
        cursor: editable ? (isDragging ? "grabbing" : "grab") : "default",
        userSelect: isDragging ? "none" : "auto",
        zIndex: isDragging ? 50 : isSelected ? 40 : 10,
        width: "fit-content",
        maxWidth: "95%",
        transition: isDragging ? "none" : "box-shadow 0.15s ease, outline 0.15s ease",
        outline: isSelected ? "2px solid rgba(99,132,255,0.85)" : "none",
        outlineOffset: 4,
        boxShadow: isSelected
          ? "0 0 0 1px rgba(99,132,255,0.3), 0 0 12px rgba(99,132,255,0.15)"
          : editable && !isDragging
          ? "0 0 0 1px rgba(255,255,255,0.2)"
          : "none",
        borderRadius: 6,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
