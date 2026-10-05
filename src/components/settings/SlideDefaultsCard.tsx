import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { writeProfile } from "@/lib/profileWrite";
import { Button } from "@/components/ui/button";
import { AuraCard } from "@/components/ui/AuraCard";
import { ColourPicker, TemplatePicker, firstThemeFor, themesFor } from "@/components/studio/LookPickers";
import type { ThemeName } from "@/carousel/render/themes";

/**
 * DEFAULTS, NOT A LOCK.
 *
 * A member who always works in one family should not re-choose it on every
 * post. These two values seed a NEW post and nothing else — a choice made
 * inside a post still overrides them for that post, and an unset default
 * simply leaves the existing behaviour alone.
 *
 * The pickers are the Composer's own, imported rather than copied, so what is
 * chosen here is exactly what appears there.
 */
export default function SlideDefaultsCard({ userId }: { userId: string | null }) {
  const { t } = useTranslation();
  const [template, setTemplate] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("diagnostic_profiles")
        .select("default_template, default_theme")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setTemplate(data?.default_template ?? null);
      setTheme(data?.default_theme ?? null);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /** Changing the family retires a colour that family cannot draw. */
  const pickTemplate = useCallback((id: string) => {
    setTemplate(id);
    setTheme((t) => (t && themesFor(id).includes(t as ThemeName) ? t : firstThemeFor(id)));
  }, []);

  const save = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    const ok = await writeProfile(userId, { default_template: template, default_theme: theme }, "SlideDefaultsCard.save");
    setSaving(false);
    if (!ok) { toast.error(t("settings.error.didntSave")); return; }
    toast.success(t("settings.toast.slidesSaved"));
  }, [userId, template, theme, t]);

  const clear = useCallback(() => { setTemplate(null); setTheme(null); }, []);

  if (!loaded) return null;

  return (
    <AuraCard variant="default" hover="none">
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{t("settings.slides.family")}</div>
          <TemplatePicker lang={i18n.language === "ar" ? "ar" : "en"} value={template ?? ""} onChange={pickTemplate} />
        </div>

        {template && (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{t("settings.slides.colour")}</div>
            <ColourPicker lang={i18n.language === "ar" ? "ar" : "en"} template={template} value={theme ?? ""} onChange={(next) => setTheme(next)} />
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm" style={{ color: "var(--ink-3)" }}>
            {template
              ? t("settings.slides.lookSet")
              : t("settings.slides.noDefault")}
          </div>
          <div className="flex gap-2">
            {template && (
              <Button variant="ghost" size="sm" onClick={clear} disabled={saving}>{t("settings.slides.clear")}</Button>
            )}
            <Button variant="default" size="sm" onClick={() => void save()} loading={saving} disabled={saving}>
              {t("settings.slides.save")}
            </Button>
          </div>
        </div>
      </div>
    </AuraCard>
  );
}
