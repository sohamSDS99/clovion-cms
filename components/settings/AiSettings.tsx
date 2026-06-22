"use client";

import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loading, InlineError } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import type { AiConfig, AiModel } from "@/lib/ui/types";

/**
 * AI provider configuration (FR-SETTINGS-03/04). Key is write-only (masked on
 * read); models populate from the proxy endpoint (key never reaches the
 * browser); includes a test-connection action and monthly budget.
 */
export function AiSettings() {
  const toast = useToast();
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<AiModel[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [maxTokens, setMaxTokens] = useState("4000");
  const [temperature, setTemperature] = useState("0.7");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    api
      .get<AiConfig>("/api/settings/ai")
      .then((c) => {
        setConfig(c);
        setDefaultModel(c.defaultModel ?? "");
        setEmbeddingModel(c.embeddingModel ?? "");
        setMaxTokens(String(c.maxTokens));
        setTemperature(String(c.temperature));
        setBudget(c.monthlyBudgetUsd ?? "");
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function loadModels() {
    setLoadingModels(true);
    try {
      const r = await api.get<{ models: AiModel[] }>("/api/settings/ai/models");
      setModels(r.models);
      toast.success(`Loaded ${r.models.length} models.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingModels(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        defaultModel: defaultModel || null,
        embeddingModel: embeddingModel || null,
        maxTokens: Number(maxTokens),
        temperature: Number(temperature),
        monthlyBudgetUsd: budget ? Number(budget) : null,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const updated = await api.put<AiConfig>("/api/settings/ai", body);
      setConfig(updated);
      setApiKey("");
      toast.success("Settings saved.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const r = await api.post<{ ok: boolean; error?: string; modelCount?: number }>(
        "/api/settings/ai/test"
      );
      if (r.ok) toast.success(`Connected — ${r.modelCount} models available.`);
      else toast.error(r.error ?? "Connection failed.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTesting(false);
    }
  }

  if (error) return <PageBody><InlineError message={error} /></PageBody>;
  if (!config) return <Loading />;

  const modelOptions = models.map((m) => m.id);

  return (
    <>
      <PageHeader title="Settings" description="AI provider, models, and budget." />
      <PageBody>
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader
              title="OpenRouter"
              subtitle="The sole LLM gateway for AI writing (Phase 2)."
              action={
                config.hasKey ? (
                  <Badge tone="published">Key set</Badge>
                ) : (
                  <Badge tone="review">No key</Badge>
                )
              }
            />
            <div className="space-y-4 p-5">
              <Input
                label="API key"
                type="password"
                placeholder={config.openrouterApiKeyMasked ?? "sk-or-…"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                hint={config.hasKey ? "leave blank to keep current" : undefined}
                autoComplete="off"
              />

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" loading={loadingModels} onClick={loadModels}>
                  Load models
                </Button>
                <Button variant="ghost" size="sm" loading={testing} onClick={test} disabled={!config.hasKey}>
                  Test connection
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ModelField
                  label="Default model"
                  value={defaultModel}
                  onChange={setDefaultModel}
                  options={modelOptions}
                />
                <ModelField
                  label="Embedding model"
                  value={embeddingModel}
                  onChange={setEmbeddingModel}
                  options={modelOptions}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input
                  label="Max tokens"
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                />
                <Input
                  label="Temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                />
                <Input
                  label="Monthly budget"
                  hint="USD"
                  type="number"
                  placeholder="none"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>

              <div className="flex justify-end border-t border-line pt-4">
                <Button variant="primary" loading={saving} onClick={save}>
                  Save settings
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

/** Model selector that degrades to a free-text input when no models loaded. */
function ModelField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  if (options.length === 0) {
    return (
      <Input
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Load models, or type an id"
      />
    );
  }
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">None</option>
      {options.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </Select>
  );
}
