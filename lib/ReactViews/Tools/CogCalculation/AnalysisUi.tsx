import styled from "styled-components";
import { analysisColors as c } from "../../../Styled/AnalysisTheme";

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
  border: 1px solid ${(p) => (p.$primary ? c.accent : c.border)};
  background: ${(p) => (p.$primary ? c.accent : c.surface)};
  color: ${(p) => (p.$primary ? "#fff" : c.ink)};
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${(p) => (p.$primary ? "#09546A" : c.muted)};
  }
  &:focus-visible {
    outline: 3px solid #5aa9c1;
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
  background: ${c.muted};
  border: 1px solid ${c.border};
  border-radius: 10px;
`;
export const Heading = styled.h3`
  margin: 0;
  color: ${c.ink};
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
`;
export const Hint = styled.p`
  margin: 6px 0 0;
  color: ${c.secondary};
  font-size: 13px;
  line-height: 1.55;
`;
export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: ${c.ink};
  font-size: 13px;
  font-weight: 600;
  input,
  select {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 8px 10px;
    border: 1px solid #bbcad6;
    border-radius: 7px;
    background: white;
    color: ${c.ink};
    font: inherit;
    font-weight: 400;
    &:focus-visible {
      outline: 2px solid ${c.accent};
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
  border: 1px solid ${c.border};
  border-radius: 8px;
  padding: 0 12px;
  summary {
    cursor: pointer;
    padding: 13px 0;
    color: ${c.ink};
    font-size: 13px;
    font-weight: 600;
  }
  &[open] {
    padding-bottom: 12px;
  }
`;
export const Notice = styled.div`
  color: #8a3e12;
  background: #fff5eb;
  border: 1px solid #f2d5b8;
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
`;
