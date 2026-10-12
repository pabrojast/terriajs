import {
  FC,
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useRef
} from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import createGuid from "terriajs-cesium/Source/Core/createGuid";
import Box from "../../../../Styled/Box";
import Icon, { StyledIcon } from "../../../../Styled/Icon";
import Text from "../../../../Styled/Text";
import CloseButton from "../../../Generic/CloseButton";
import { useDraggable } from "../../../Drag/useDraggable";
import { PrefaceBox } from "../../../Generic/PrefaceBox";

export interface ChartJsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  triggerRef?: RefObject<HTMLButtonElement>;
  /**
   * Optional key under which the modal's position and size are remembered for
   * the lifetime of the page (session). Reopening with the same key restores the
   * last drag offset and dimensions. Omit for a always-centered, default-sized
   * modal.
   */
  persistKey?: string;
  children: ReactNode;
}

/**
 * Session-scoped store of the modal's drag offset (dx/dy) and box size, keyed by
 * `persistKey`. Module-level so it survives unmount/remount but resets on reload.
 */
const savedRects = new Map<
  string,
  { dx: number; dy: number; width: number; height: number }
>();

const DEFAULT_WIDTH = "min(960px, 92vw)";
const DEFAULT_HEIGHT = "70vh";

/** Read the dx/dy translate offset out of an element's inline transform. */
const parseTranslate = (
  transform?: string | null
): { dx: number; dy: number } => {
  if (!transform) return { dx: 0, dy: 0 };
  const match = transform.match(/translate3d\(([^,]+),\s*([^,]+),\s*[^)]+\)/);
  if (match) {
    const dx = parseFloat(match[1]);
    const dy = parseFloat(match[2]);
    return {
      dx: Number.isFinite(dx) ? dx : 0,
      dy: Number.isFinite(dy) ? dy : 0
    };
  }
  return { dx: 0, dy: 0 };
};

// Full-viewport flex layer that centers the box WITHOUT a translate transform,
// so `useDraggable`'s `translate3d` (applied to the box) does not clobber the
// centering. The layer is click-through; only the box captures pointer events.
const ChartJsModalLayer = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99990;
  pointer-events: none;
`;

// Centered, draggable + resizable dialog box. The visual pattern (shadow,
// rounded, theme background) is copied from DataAttributionModal but sized large
// so the chart has room to breathe. `resize: both` requires `overflow: hidden`.
const ChartJsModalBox = styled(Box).attrs({
  rounded: true,
  paddedRatio: 4,
  column: true
})`
  pointer-events: auto;
  resize: both;
  overflow: hidden;
  min-width: 360px;
  min-height: 240px;
  max-width: 95vw;
  max-height: 90vh;
  background-color: ${(props) => props.theme.dark};
  box-shadow: 0 6px 6px 0 rgba(0, 0, 0, 0.12), 0 10px 20px 0 rgba(0, 0, 0, 0.05);
  &:focus {
    outline: none;
  }
`;

// The header doubles as the drag handle: dragging is restricted to this row via
// the `.chartjs-modal-handle` selector passed to `useDraggable`.
const ChartJsModalHeader = styled(Box).attrs({
  fullWidth: true,
  verticalCenter: true,
  justifySpaceBetween: true
})`
  cursor: move;
  user-select: none;
  gap: 8px;
`;

const GripHandle = styled.span`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  opacity: 0.6;
  cursor: move;
`;

// Fills the remaining vertical space below the header so the chart can expand.
const ChartJsModalBody = styled(Box).attrs({
  column: true,
  fullWidth: true
})`
  flex: 1;
  min-height: 0;
`;

/**
 * Light modal shell that renders the large "view larger" Chart.js chart passed
 * as `children`. It deliberately does NOT import chart.js (or its wrappers):
 * the heavy chart is supplied by the caller so this file stays out of the
 * Chart.js bundle and only ships the portal/dialog chrome.
 *
 * The box is draggable by its header and resizable from its corner; when a
 * `persistKey` is supplied the last position/size is restored on reopen for the
 * lifetime of the page.
 */
const ChartJsModal: FC<ChartJsModalProps> = ({
  isOpen,
  onClose,
  title,
  triggerRef,
  persistKey,
  children
}) => {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [dragRef, dragControls] = useDraggable({
    handleSelector: ".chartjs-modal-handle"
  });

  // Merge the focus ref (dialogRef) with the draggable callback ref so the box
  // node feeds both: focus management reads dialogRef.current; useDraggable
  // tracks the same node for its mousedown/touchstart drag handling.
  const setBoxRef = useCallback(
    (el: HTMLDivElement | null) => {
      dialogRef.current = el;
      dragRef(el as unknown as HTMLElement | null);
    },
    [dragRef]
  );

  // Stable unique id for aria-labelledby. We avoid React 18's `useId` because
  // TerriaJS must compile against consuming apps that may resolve older React
  // typings; `createGuid` is the established pattern in this codebase.
  const titleIdRef = useRef<string>();
  if (!titleIdRef.current) {
    titleIdRef.current = `chartjs-modal-title-${createGuid()}`;
  }
  const titleId = titleIdRef.current;

  // ESC to close.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Body scroll lock. The saved value is restored on cleanup so closing the
  // feature-info while the modal is open never leaves the body stuck.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Focus management: focus the dialog on open, restore focus to the trigger on
  // close/unmount.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const trigger = triggerRef?.current;
    dialogRef.current?.focus();
    return () => {
      trigger?.focus();
    };
  }, [isOpen, triggerRef]);

  // Session position/size persistence. On open: restore the saved drag offset
  // and box size (if any). On close/unmount (cleanup, while the node still
  // exists): read the live transform + measured size and store them.
  useEffect(() => {
    if (!isOpen || !persistKey) {
      return;
    }
    const node = dialogRef.current;
    const saved = savedRects.get(persistKey);
    if (node && saved) {
      node.style.width = `${saved.width}px`;
      node.style.height = `${saved.height}px`;
      dragControls.setPosition(saved.dx, saved.dy, true);
    }
    return () => {
      if (!node) {
        return;
      }
      const { dx, dy } = parseTranslate(node.style.transform);
      const rect = node.getBoundingClientRect();
      savedRects.set(persistKey, {
        dx,
        dy,
        width: rect.width,
        height: rect.height
      });
    };
  }, [isOpen, persistKey, dragControls]);

  if (!isOpen) {
    return null;
  }

  const savedRect = persistKey ? savedRects.get(persistKey) : undefined;

  return ReactDOM.createPortal(
    <>
      <PrefaceBox
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
        pseudoBg
        css={{ top: 0, left: 0, zIndex: 99989 }}
      />
      <ChartJsModalLayer>
        <ChartJsModalBox
          ref={setBoxRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: savedRect ? `${savedRect.width}px` : DEFAULT_WIDTH,
            height: savedRect ? `${savedRect.height}px` : DEFAULT_HEIGHT
          }}
        >
          <ChartJsModalHeader className="chartjs-modal-handle">
            <Box verticalCenter css={{ gap: "8px", minWidth: 0 }}>
              <GripHandle aria-hidden="true" title={t("chart.dragToMove")}>
                <StyledIcon
                  glyph={Icon.GLYPHS.menuDotted}
                  styledWidth="16px"
                  light
                />
              </GripHandle>
              <Text id={titleId} textLight extraLarge bold>
                {title ?? t("chart.sectionLabel")}
              </Text>
            </Box>
            <CloseButton
              color="#ffffff"
              noAbsolute
              onClick={onClose}
              aria-label={t("general.close")}
            />
          </ChartJsModalHeader>
          <ChartJsModalBody>{children}</ChartJsModalBody>
        </ChartJsModalBox>
      </ChartJsModalLayer>
    </>,
    document.getElementById("ui-root") || document.body
  );
};

export default ChartJsModal;
