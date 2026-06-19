import { FC, ReactNode, RefObject, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import createGuid from "terriajs-cesium/Source/Core/createGuid";
import Box from "../../../../Styled/Box";
import Text from "../../../../Styled/Text";
import CloseButton from "../../../Generic/CloseButton";
import { PrefaceBox } from "../../../Generic/PrefaceBox";

export interface ChartJsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  triggerRef?: RefObject<HTMLButtonElement>;
  children: ReactNode;
}

// Centered dialog box. The visual pattern (centering, shadow, rounded, theme
// background) is copied from DataAttributionModal but sized large so the chart
// has room to breathe.
const ChartJsModalBox = styled(Box).attrs({
  position: "absolute",
  styledWidth: "min(960px, 92vw)",
  styledHeight: "80vh",
  styledMaxHeight: "85vh",
  rounded: true,
  paddedRatio: 4,
  column: true
})`
  /* The backdrop (PrefaceBox) is position: fixed (full viewport). Use fixed
     here too so the box is centered relative to the viewport rather than the
     nearest positioned ancestor inside #ui-root. Overrides the absolute
     position set by the position attr above. */
  position: fixed;
  z-index: 99990;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background-color: ${(props) => props.theme.dark};
  box-shadow: 0 6px 6px 0 rgba(0, 0, 0, 0.12), 0 10px 20px 0 rgba(0, 0, 0, 0.05);
  &:focus {
    outline: none;
  }
  @media (max-width: ${(props) => props.theme.mobile}px) {
    width: 92vw;
  }
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
 */
const ChartJsModal: FC<ChartJsModalProps> = ({
  isOpen,
  onClose,
  title,
  triggerRef,
  children
}) => {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
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

  // Focus management: focus the close button on open, restore focus to the
  // trigger on close/unmount.
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

  if (!isOpen) {
    return null;
  }

  return ReactDOM.createPortal(
    <>
      <PrefaceBox
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
        pseudoBg
        css={{ top: 0, left: 0, zIndex: 99989 }}
      />
      <ChartJsModalBox
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <Box fullWidth verticalCenter justifySpaceBetween>
          <Text id={titleId} textLight extraLarge bold>
            {title ?? t("chart.sectionLabel")}
          </Text>
          <CloseButton
            color="#ffffff"
            noAbsolute
            onClick={onClose}
            aria-label={t("general.close")}
          />
        </Box>
        <ChartJsModalBody>{children}</ChartJsModalBody>
      </ChartJsModalBox>
    </>,
    document.getElementById("ui-root") || document.body
  );
};

export default ChartJsModal;
