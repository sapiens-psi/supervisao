import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export interface SupervisionFormValues {
  title: string;
  description: string;
  location: string;
  starts_at: string; // datetime-local
  duration_minutes: number;
  max_students: number;
}

export function SupervisionForm({
  initial,
  onSubmit,
  submitLabel = "Salvar",
}: {
  initial?: Partial<SupervisionFormValues>;
  onSubmit: (values: SupervisionFormValues) => Promise<void> | void;
  submitLabel?: string;
}) {
  const [v, setV] = useState<SupervisionFormValues>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    location: initial?.location ?? "",
    starts_at: initial?.starts_at ?? "",
    duration_minutes: initial?.duration_minutes ?? 60,
    max_students: initial?.max_students ?? 20,
  });
  const [saving, setSaving] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(v);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Título da supervisão *</Label>
        <Input id="title" required maxLength={120} value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" maxLength={1000} value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Local ou link da reunião</Label>
        <Input id="location" maxLength={300} value={v.location}
          onChange={(e) => setV({ ...v, location: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="starts_at">Data e hora *</Label>
          <Input id="starts_at" type="datetime-local" required value={v.starts_at}
            onChange={(e) => setV({ ...v, starts_at: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration">Duração (min) *</Label>
          <Input id="duration" type="number" min={5} max={600} required value={v.duration_minutes}
            onChange={(e) => setV({ ...v, duration_minutes: Number(e.target.value) })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max">Vagas *</Label>
          <Input id="max" type="number" min={1} max={500} required value={v.max_students}
            onChange={(e) => setV({ ...v, max_students: Number(e.target.value) })} />
        </div>
      </div>
      <Button type="submit" disabled={saving}>{saving ? "Salvando…" : submitLabel}</Button>
    </form>
  );
}