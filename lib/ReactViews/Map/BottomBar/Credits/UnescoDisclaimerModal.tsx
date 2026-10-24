import { observer } from "mobx-react";
import { FC } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Box from "../../../../Styled/Box";
import Button from "../../../../Styled/Button";
import Spacing from "../../../../Styled/Spacing";
import Text from "../../../../Styled/Text";
import CloseButton from "../../../Generic/CloseButton";
import { PrefaceBox } from "../../../Generic/PrefaceBox";

interface IUnescoDisclaimerModalProps {
  closeModal: () => void;
  acceptDisclaimer: () => void;
}

const DisclaimerBox = styled(Box).attrs({
  position: "absolute",
  styledWidth: "600px",
  styledMaxHeight: "400px",
  backgroundColor: "white",
  rounded: true,
  paddedRatio: 4,
  overflowY: "auto",
  scroll: true,
  column: true
})`
  z-index: 99989;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 6px 6px 0 rgba(0, 0, 0, 0.12), 0 10px 20px 0 rgba(0, 0, 0, 0.05);
  @media (max-width: ${(props) => props.theme.mobile}px) {
    width: 90%;
    margin: 0 5%;
  }
`;

const ButtonContainer = styled(Box)`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`;

export const UnescoDisclaimerModal: FC<IUnescoDisclaimerModalProps> = observer(
  ({ closeModal, acceptDisclaimer }) => {
    const { t } = useTranslation();

    return ReactDOM.createPortal(
      <>
        <PrefaceBox
          onClick={closeModal}
          role="presentation"
          aria-hidden="true"
          pseudoBg
          css={{ top: 0, left: 0, zIndex: 99989 }}
        />
        <DisclaimerBox>
          <CloseButton color="#666" topRight onClick={closeModal} />
          <Text extraExtraLarge bold textDarker>
            {t("unescoDisclaimer.title")}
          </Text>
          <Spacing bottom={3} />
          <Text medium>{t("unescoDisclaimer.content")}</Text>
          <Spacing bottom={2} />
          <Text medium>
            <a
              href="https://www.unesco.org/en/geospatial/disclaimer"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("unescoDisclaimer.linkText")}
            </a>
          </Text>
          <ButtonContainer>
            <Button secondary onClick={closeModal}>
              {t("unescoDisclaimer.cancel")}
            </Button>
            <Button
              primary
              onClick={() => {
                acceptDisclaimer();
                closeModal();
              }}
            >
              {t("unescoDisclaimer.accept")}
            </Button>
          </ButtonContainer>
        </DisclaimerBox>
      </>,
      document.getElementById("ui-root") || document.body
    );
  }
);
