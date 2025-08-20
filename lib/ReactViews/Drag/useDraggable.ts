import { useCallback, useEffect, useRef, useState } from "react";

export const useDraggable = (options?: { handleSelector?: string }) => {
  const [node, setNode] = useState<HTMLElement | null>();
  // Track absolute position (left/top in px) instead of transform for better resize compatibility
  const leftRef = useRef(0);
  const topRef = useRef(0);
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
    const offsetParentRect = (
      node.offsetParent as HTMLElement | null
    )?.getBoundingClientRect();
    const parentLeft = offsetParentRect ? offsetParentRect.left : 0;
    const parentTop = offsetParentRect ? offsetParentRect.top : 0;

    const minAllowedLeft = minX - parentLeft;
    const maxAllowedLeft = maxX - elementRect.width - parentLeft;
    const minAllowedTop = minY - parentTop;
    const maxAllowedTop = maxY - elementRect.height - parentTop;

    const constrainedLeft = Math.min(
      Math.max(leftRef.current, minAllowedLeft),
      Math.max(minAllowedLeft, maxAllowedLeft)
    );
    const constrainedTop = Math.min(
      Math.max(topRef.current, minAllowedTop),
      Math.max(minAllowedTop, maxAllowedTop)
    );

    node.style.left = `${constrainedLeft}px`;
    node.style.top = `${constrainedTop}px`;
    leftRef.current = constrainedLeft;
    topRef.current = constrainedTop;
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
    (left: number, top: number) => {
      if (!node) return;
      // Ensure absolute positioning so left/top apply
      const computed = window.getComputedStyle(node);
      if (computed.position === "static") {
        node.style.position = "absolute";
      }
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      leftRef.current = left;
      topRef.current = top;
    },
    [node]
  );

  // Generic drag start handler
  const startDrag = useCallback(
    (clientX: number, clientY: number) => {
      const elementRect = node?.getBoundingClientRect();
      if (!elementRect) return;

      const offsetParentRect = (
        node!.offsetParent as HTMLElement | null
      )?.getBoundingClientRect();
      const parentLeft = offsetParentRect ? offsetParentRect.left : 0;
      const parentTop = offsetParentRect ? offsetParentRect.top : 0;

      // Pointer offset inside the element
      const offsetX = clientX - elementRect.left;
      const offsetY = clientY - elementRect.top;

      const moveHandler = (moveClientX: number, moveClientY: number) => {
        const newLeft = moveClientX - parentLeft - offsetX;
        const newTop = moveClientY - parentTop - offsetY;
        updateElementPosition(newLeft, newTop);
      };

      const endHandler = () => {
        // Clamp within viewport when drag ends
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

  // Initialize position and check bounds when the component mounts
  useEffect(() => {
    if (!node) return;
    const computed = window.getComputedStyle(node);
    if (computed.position === "static") {
      node.style.position = "absolute";
    }
    // Initialize left/top if not already set
    if (!node.style.left) node.style.left = `${leftRef.current}px`;
    if (!node.style.top) node.style.top = `${topRef.current}px`;
    constrainToBounds();
  }, [node, constrainToBounds]);

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
    (left: number, top: number, clampToBounds: boolean = false) => {
      updateElementPosition(left, top);
      if (clampToBounds) constrainToBounds();
    },
    [updateElementPosition, constrainToBounds]
  );

  return [ref, { setPosition, constrainToBounds }] as const;
};
