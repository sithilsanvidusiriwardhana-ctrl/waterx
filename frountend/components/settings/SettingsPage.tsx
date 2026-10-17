"use client";

import { useState } from "react";
import { Check, Moon, RotateCcw, Sun, X } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import type { Theme } from "@/lib/settings";
import { ModalFrame } from "@/components/shared/ModalFrame";

type ToastState = { type: "success" | "error"; message: string } | null;

export function SettingsPage() {
  const { settings, storageError, updateDisplayName, updateTheme, resetSettings } = useSettings();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? settings.displayName;
  const [nameError, setNameError] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  function saveName() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Enter a display name before saving.");
      setToast({ type: "error", message: "Display name cannot be empty." });
      return;
    }
    if (trimmedName.length > 50) {
      setNameError("Display name must be 50 characters or fewer.");
      setToast({ type: "error", message: "Display name is too long." });
      return;
    }
    const persisted = updateDisplayName(trimmedName);
    setNameDraft(trimmedName);
    setNameError("");
    setToast({
      type: persisted ? "success" : "error",
      message: persisted ? "Display name updated." : "Display name updated for this session only; browser storage failed.",
    });
  }

  function cancelName() {
    setNameDraft(null);
    setNameError("");
  }

  function chooseTheme(theme: Theme) {
    const persisted = updateTheme(theme);
    setToast({
      type: persisted ? "success" : "error",
      message: persisted
        ? `${theme === "dark" ? "Dark" : "Light"} mode enabled.`
        : `${theme === "dark" ? "Dark" : "Light"} mode is active for this session only; browser storage failed.`,
    });
  }

  function confirmDefaults() {
    const persisted = resetSettings();
    setNameDraft(null);
    setNameError("");
    setConfirmReset(false);
    setToast({
      type: persisted ? "success" : "error",
      message: persisted
        ? "Settings restored to defaults."
        : "Defaults are active for this session only; browser storage failed.",
    });
  }

  return (
    <div className="dashboard-content settings-page">
      <div className="page-heading settings-heading">
        <div>
          <p className="eyebrow">DASHBOARD <span aria-hidden="true">/</span> SETTINGS</p>
          <h1>Settings</h1>
          <p className="page-subtitle">Manage your profile and dashboard preferences.</p>
        </div>
      </div>
      {storageError && <div className="storage-warning" role="alert">{storageError}</div>}

      <div className="settings-layout">
        <section className="panel settings-card" aria-labelledby="profile-title">
          <div className="settings-card-heading"><span className="settings-avatar" aria-hidden="true">{settings.displayName.charAt(0).toUpperCase()}</span><div><h2 id="profile-title">Profile Settings</h2><p>Update the name shown across your dashboard. Saved in this browser only.</p></div></div>
          <div className="settings-current"><span>Current display name</span><strong>{settings.displayName}</strong></div>
          <label className="settings-field" htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            className="settings-input"
            type="text"
            value={name}
            maxLength={50}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "display-name-error" : "display-name-hint"}
            onChange={(event) => { setNameDraft(event.target.value); setNameError(""); }}
          />
          {nameError ? <p className="settings-error" id="display-name-error" role="alert">{nameError}</p> : <p className="settings-hint" id="display-name-hint">Use up to 50 characters.</p>}
          <div className="settings-actions"><button className="button primary" onClick={saveName}><Check size={15} />Save Changes</button><button className="button secondary" onClick={cancelName}>Cancel</button></div>
        </section>

        <section className="panel settings-card" aria-labelledby="appearance-title">
          <div className="settings-card-heading"><span className="settings-section-icon"><Sun size={18} /></span><div><h2 id="appearance-title">Appearance</h2><p>Choose how waterX looks across your dashboard. Saved in this browser only.</p></div></div>
          <div className="theme-options" role="group" aria-label="Dashboard theme">
            <button className={`theme-option ${settings.theme === "light" ? "selected" : ""}`} aria-pressed={settings.theme === "light"} onClick={() => chooseTheme("light")}>
              <span className="theme-preview light-preview"><Sun size={19} /></span><span className="theme-option-copy"><strong>Light Mode</strong><small>Bright and clear</small></span><span className="theme-radio" aria-hidden="true" />
            </button>
            <button className={`theme-option ${settings.theme === "dark" ? "selected" : ""}`} aria-pressed={settings.theme === "dark"} onClick={() => chooseTheme("dark")}>
              <span className="theme-preview dark-preview"><Moon size={18} /></span><span className="theme-option-copy"><strong>Dark Mode</strong><small>Easy on the eyes</small></span><span className="theme-radio" aria-hidden="true" />
            </button>
          </div>
        </section>

        <section className="panel settings-card reset-card" aria-labelledby="reset-title">
          <div className="settings-card-heading"><span className="settings-section-icon reset-icon"><RotateCcw size={18} /></span><div><h2 id="reset-title">Reset Settings</h2><p>Restore your display name and appearance preference to their defaults.</p></div></div>
          <button className="button reset-button" onClick={() => setConfirmReset(true)}><RotateCcw size={14} />Reset to Defaults</button>
        </section>
      </div>

      {toast && <div className={`settings-toast ${toast.type}`} role={toast.type === "error" ? "alert" : "status"} aria-live="polite"><span>{toast.message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button></div>}

      {confirmReset && <ModalFrame labelledBy="reset-dialog-title" onClose={() => setConfirmReset(false)}>
        <div className="modal-heading"><div><span className="eyebrow">PREFERENCES</span><h2 id="reset-dialog-title">Reset settings?</h2></div><button className="icon-button" onClick={() => setConfirmReset(false)} aria-label="Close dialog"><X size={19} /></button></div>
        <div className="dialog-content"><p>Your display name and appearance preference will return to their default values. Plant data and other saved dashboard information will not be changed.</p></div>
        <div className="modal-actions"><button className="button secondary" onClick={() => setConfirmReset(false)}>Cancel</button><button className="button primary" onClick={confirmDefaults}>Reset settings</button></div>
      </ModalFrame>}
    </div>
  );
}