import styled from "styled-components";

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
`;
export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;
export const Action = styled.button<{ $primary?: boolean }>`
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 9px 14px;
  border-radius: 8px;
  border: 1px solid
    ${(p) => (p.$primary ? p.theme.colorPrimary : p.theme.darkLighter)};
  background: ${(p) => (p.$primary ? p.theme.colorPrimary : p.theme.dark)};
  color: ${(p) => (p.$primary ? "#fff" : p.theme.textLight)};
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${(p) =>
      p.$primary ? p.theme.colorPrimary : p.theme.darkWithOverlay};
  }
  &:focus-visible {
    outline: 3px solid ${(p) => p.theme.colorPrimary};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }
`;
export const Card = styled.div`
  padding: 14px;
  background: ${(p) => p.theme.darkWithOverlay};
  border: 1px solid ${(p) => p.theme.darkLighter};
  border-radius: 10px;
`;
export const Heading = styled.h3`
  margin: 0;
  color: ${(p) => p.theme.textLight};
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
`;
export const Hint = styled.p`
  margin: 6px 0 0;
  color: ${(p) => p.theme.textLightDimmed};
  font-size: 13px;
  line-height: 1.55;
`;
export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: ${(p) => p.theme.textLight};
  font-size: 13px;
  font-weight: 600;
  input,
  select {
    color-scheme: dark;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 8px 10px;
    border: 1px solid ${(p) => p.theme.darkLighter};
    border-radius: 7px;
    background: ${(p) => p.theme.dark};
    color: ${(p) => p.theme.textLight};
    font: inherit;
    font-weight: 400;
    &:focus-visible {
      outline: 2px solid ${(p) => p.theme.colorPrimary};
      outline-offset: 2px;
    }
  }
`;
export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
`;
export const Details = styled.details`
  border: 1px solid ${(p) => p.theme.darkLighter};
  border-radius: 8px;
  padding: 0 12px;
  summary {
    cursor: pointer;
    padding: 13px 0;
    color: ${(p) => p.theme.textLight};
    font-size: 13px;
    font-weight: 600;
  }
  &[open] {
    padding-bottom: 12px;
  }
`;
export const Notice = styled.div`
  color: ${(p) => p.theme.textLight};
  background: ${(p) => p.theme.darkWithOverlay};
  border: 1px solid ${(p) => p.theme.colorPrimary};
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
`;
