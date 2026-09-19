import { runInAction } from "mobx";
import { observer } from "mobx-react";
import { FC, KeyboardEvent } from "react";
import styled from "styled-components";
import CommonStrata from "../../Models/Definition/CommonStrata";
import { SelectableDimensionEnum as SelectableDimensionEnumModel } from "../../Models/SelectableDimensions/SelectableDimensions";

const PillGroup = styled.div`
  display: flex;
  width: 100%;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid ${(props) => props.theme.darkLighter};
`;

const Pill = styled.button<{ $selected: boolean }>`
  flex: 1 1 0;
  min-width: 0;
  padding: 6px 4px;
  border: 0;
  border-right: 1px solid ${(props) => props.theme.darkLighter};
  font: inherit;
  font-size: 13px;
  font-weight: ${(props) => (props.$selected ? 600 : 400)};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  color: ${(props) => props.theme.textLight};
  background: ${(props) =>
    props.$selected ? props.theme.colorPrimary : props.theme.darkLighter};
  opacity: ${(props) => (props.$selected ? 1 : 0.85)};

  &:last-child {
    border-right: 0;
  }
  &:hover {
    opacity: 1;
  }
  &:focus-visible {
    outline: 2px solid ${(props) => props.theme.textLight};
    outline-offset: -2px;
  }
`;

/**
 * Segmented control for an enum dimension: every option visible at once, one
 * click to switch. A radio group for assistive technology, with the arrow-key
 * behaviour that implies.
 */
export const SelectableDimensionPills: FC<{
  id: string;
  dim: SelectableDimensionEnumModel;
}> = observer(({ id, dim }) => {
  const options = dim.options ?? [];
  if (options.length === 0) return null;

  const select = (optionId: string | undefined) => {
    if (optionId === undefined || optionId === dim.selectedId) return;
    runInAction(() => dim.setDimensionValue(CommonStrata.user, optionId));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
    if (step === 0) return;
    event.preventDefault();
    const current = options.findIndex((option) => option.id === dim.selectedId);
    const next = options[(current + step + options.length) % options.length];
    select(next.id);
    const buttons =
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
    buttons[options.indexOf(next)]?.focus();
  };

  return (
    <PillGroup
      id={id}
      role="radiogroup"
      aria-label={dim.name}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const selected = option.id === dim.selectedId;
        return (
          <Pill
            key={option.id ?? "undefined"}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || dim.selectedId === undefined ? 0 : -1}
            $selected={selected}
            title={option.name ?? option.id}
            onClick={() => select(option.id)}
          >
            {option.name ?? option.id}
          </Pill>
        );
      })}
    </PillGroup>
  );
});
