import { useCallback, useEffect, useRef, useState } from "react";

export const useDraggable = (options?: { handleSelector?: string }) => {
  const [node, setNode] = useState<HTMLElement | null>();
  // Use refs to track current values without triggering rerenders
  const dxRef = useRef(0);
  const dyRef = useRef(0);
  const handleSelectorRef = useRef(options?.handleSelector);

  // Update the ref if the handleSelector option changes
  useEffect(() => {
    handleSelectorRef.current = options?.handleSelector;
  }, [options?.handleSelector]);

  const ref = useCallback((nodeEle: HTMLElement | null) => {
    setNode(nodeEle);
  }, []);

  // Function to calculate bounds using client rects (more robust for absolutely positioned parents)
  const calculateBounds = useCallback(() => {
    if (!node) return null;

    // Use viewport bounds so the panel can be dragged anywhere on screen, regardless of parent sizing
    const margin = 8; // small margin to avoid clipping
    return {
      minX: margin,
      maxX: window.innerWidth - margin,
      minY: margin,
      maxY: window.innerHeight - margin
    };
  }, [node]);

  // Function to constrain element within bounds
  // Uses direct DOM manipulation to avoid React state batching delays
  const constrainToBounds = useCallback(() => {
    if (!node) return;

    const elementRect = node.getBoundingClientRect();
    const bounds = calculateBounds();
    if (!bounds) return;

    const { minX, maxX, minY, maxY } = bounds;
    const currentDx = dxRef.current;
    const currentDy = dyRef.current;

    // Calculate constrained position
    // elementRect.left/top already include current transform (dx/dy)
    // base position without transform
    const baseLeft = elementRect.left - currentDx;
    const baseTop = elementRect.top - currentDy;

    const minAllowedDx = minX - baseLeft;
    const maxAllowedDx = maxX - elementRect.width - baseLeft;
    const minAllowedDy = minY - baseTop;
    const maxAllowedDy = maxY - elementRect.height - baseTop;

    const constrainedDx = Math.min(Math.max(currentDx, minAllowedDx), maxAllowedDx);
    const constrainedDy = Math.min(Math.max(currentDy, minAllowedDy), maxAllowedDy);

    // Directly update the DOM for immediate visual effect
    node.style.transform = `translate3d(${constrainedDx}px, ${constrainedDy}px, 0)`;

    // Update refs to track current position
    dxRef.current = constrainedDx;
    dyRef.current = constrainedDy;
  }, [node, calculateBounds]);

  // Function to check if the event target is the handle or within the handle
  const isValidDragHandle = useCallback(
    (target: EventTarget | null): boolean => {
      if (!handleSelectorRef.current || !node || !target) return true;

      // If we have a handle selector, check if the target matches or is within a matching element
      const handle = node.querySelector(handleSelectorRef.current);
      return handle
        ? handle === target || handle.contains(target as Node)
        : false;
    },
    [node]
  );

  // Shared function to update element position
  const updateElementPosition = useCallback(
    (dx: number, dy: number) => {
      if (!node) return;
      node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      dxRef.current = dx;
      dyRef.current = dy;
    },
    [node]
  );

  // Generic drag start handler
  const startDrag = useCallback(
    (clientX: number, clientY: number) => {
      // Get element dimensions to ensure it stays within bounds
      const elementRect = node?.getBoundingClientRect();
      if (!elementRect) return;

      // Calculate the offset of the pointer within the element
      const offsetX = clientX - elementRect.left;
      const offsetY = clientY - elementRect.top;

      // Capture the current dx and dy at the start of the drag operation
      // These values need to be captured here, not read in the move handler
      const initialDx = dxRef.current;
      const initialDy = dyRef.current;

      const moveHandler = (clientX: number, clientY: number) => {
        // Calculate the new position relative to the start position
        const newDx = clientX - elementRect.left - offsetX + initialDx;
        const newDy = clientY - elementRect.top - offsetY + initialDy;

        // Allow free movement during dragging
        updateElementPosition(newDx, newDy);
      };

      const endHandler = () => {
        // Apply constraints only at the end of the drag
        constrainToBounds();
      };

      return { moveHandler, endHandler };
    },
    [node, updateElementPosition, constrainToBounds]
  );

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      // Check if the event target is a valid drag handle
      if (!isValidDragHandle(e.target)) return;

      const dragResult = startDrag(e.clientX, e.clientY);

      if (!dragResult) return;
      const { moveHandler, endHandler } = dragResult;

      const handleMouseMove = (e: MouseEvent) => {
        moveHandler(e.clientX, e.clientY);
      };

      const handleMouseUp = () => {
        endHandler();
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [isValidDragHandle, startDrag]
  );

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      // Check if the event target is a valid drag handle
      if (!isValidDragHandle(e.target)) return;

      const touch = e.touches[0];
      const dragResult = startDrag(touch.clientX, touch.clientY);

      if (!dragResult) return;
      const { moveHandler, endHandler } = dragResult;

      const handleTouchMove = (e: TouchEvent) => {
        const touch = e.touches[0];
        moveHandler(touch.clientX, touch.clientY);
      };

      const handleTouchEnd = () => {
        endHandler();
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
      };

      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);
    },
    [isValidDragHandle, startDrag]
  );

  // Check bounds when the component mounts
  useEffect(() => {
    constrainToBounds();
  }, [constrainToBounds]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      constrainToBounds();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [constrainToBounds]);

  useEffect(() => {
    if (!node) {
      return;
    }
    node.addEventListener("mousedown", handleMouseDown);
    node.addEventListener("touchstart", handleTouchStart);
    return () => {
      node.removeEventListener("mousedown", handleMouseDown);
      node.removeEventListener("touchstart", handleTouchStart);
    };
  }, [node, handleMouseDown, handleTouchStart]);

  // Public controls for external consumers
  const setPosition = useCallback(
    (dx: number, dy: number, clampToBounds: boolean = false) => {
      updateElementPosition(dx, dy);
      if (clampToBounds) constrainToBounds();
    },
    [updateElementPosition, constrainToBounds]
  );

  return [ref, { setPosition, constrainToBounds }] as const;
};
