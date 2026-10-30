import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import DataAssistantViewModel from "../../../ReactViewModels/DataAssistantViewModel";
import { MapProposal } from "../../../Models/DataAssistant/Types";

const Section = styled.section`
  margin: 10px 0;
  padding: 10px;
  border: 1px solid #879aa4;
  border-radius: 5px;
  color: #183748;
  background: #f7fafb;
  input,
  select {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 5px 0 8px;
    color: #183748;
    background: white;
    border: 1px solid #879aa4;
    border-radius: 3px;
    padding: 7px;
  }
  a {
    color: #075b83;
    overflow-wrap: anywhere;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
`;
const Button = styled.button`
  background: #175b76;
  color: white;
  border: 1px solid #175b76;
  border-radius: 4px;
  padding: 7px 10px;
  margin: 5px 6px 5px 0;
  cursor: pointer;
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
  &:focus-visible {
    outline: 3px solid #e89b20;
    outline-offset: 2px;
  }
`;
export const ProposalCard = observer(
  ({ vm, proposal }: { vm: DataAssistantViewModel; proposal: MapProposal }) => {
    const { t } = useTranslation();
    const applied = vm.appliedIds.includes(proposal.id);
    return (
      <Section aria-label={t("dataAssistant.proposal")}>
        <strong>{proposal.title}</strong>
        <ul>
          {proposal.operations.map((op, index) => {
            const name =
              "source_id" in op
                ? (vm.sources.find((s) => s.id === op.source_id)?.name ??
                  op.source_id)
                : "";
            return (
              <li key={index}>
                {t(`dataAssistant.operations.${op.kind}`)}
                {name ? `: ${name}` : ""}
                {op.kind === "update_layer" && (
                  <ul>
                    {Object.entries(op.traits).map(([key, value]) => (
                      <li key={key}>
                        {t(`dataAssistant.properties.${key}`, {
                          defaultValue: key
                        })}
                        {typeof value === "string" || typeof value === "number"
                          ? `: ${value}`
                          : typeof value === "boolean"
                            ? `: ${t(value ? "dataAssistant.yes" : "dataAssistant.no")}`
                            : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {op.kind === "add_url" && <p>{op.url}</p>}
                {op.kind === "move_layer" && ` (${op.index + 1})`}
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          disabled={vm.working || applied}
          onClick={() => void vm.applyProposal(proposal)}
        >
          {t(applied ? "dataAssistant.applied" : "dataAssistant.apply")}
        </Button>
      </Section>
    );
  }
);
