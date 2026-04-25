import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Loader2 } from "lucide-react";

type Status = "idle" | "loading" | "success" | "duplicate" | "error";

const SENIORITY = ["C-Suite", "VP", "Director", "Manager", "Other"];
const SECTOR = ["Consulting", "Energy", "Finance", "Government", "Technology", "Other"];

const RequestAccess = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [seniority, setSeniority] = useState("");
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [submittedEmail, setSubmittedEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !seniority) return;
    setStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("submit-waitlist", {
        body: { name: name.trim(), email: email.trim(), seniority, sector: sector || null },
      });
      if (error) throw error;
      setSubmittedEmail(email.trim());
      if (data?.duplicate) setStatus("duplicate");
      else setStatus("success");
    } catch (err) {
      console.error("submit-waitlist failed:", err);
      setStatus("error");
    }
  };

  const isDone = status === "success" || status === "duplicate";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full" style={{ maxWidth: "420px" }}>
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4 gold-glow">
            <Zap className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl tracking-tight text-gradient-gold mb-1">Aura</h1>
          <p className="text-sm text-muted-foreground">Strategic Intelligence</p>
        </div>

        {!isDone && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-foreground mb-2">Request early access</h2>
              <p className="text-sm text-muted-foreground">
                Aura is in closed beta. Join the waitlist and we'll reach out when your spot is ready.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="glass-card rounded-xl p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                  className="bg-secondary border-border/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={255}
                  className="bg-secondary border-border/50"
                />
              </div>

              <div className="space-y-2">
                <Label>Seniority</Label>
                <Select value={seniority} onValueChange={setSeniority} required>
                  <SelectTrigger className="bg-secondary border-border/50">
                    <SelectValue placeholder="Select your seniority" />
                  </SelectTrigger>
                  <SelectContent>
                    {SENIORITY.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Your sector (optional)</Label>
                <Select value={sector} onValueChange={setSector}>
                  <SelectTrigger className="bg-secondary border-border/50">
                    <SelectValue placeholder="Select your sector" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTOR.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {status === "error" && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
                  Something went wrong. Please try again.
                </div>
              )}

              <Button
                type="submit"
                disabled={status === "loading"}
                className="w-full text-white font-medium"
                style={{ backgroundColor: "#F97316" }}
              >
                {status === "loading" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Request access →</>
                )}
              </Button>
            </form>
          </>
        )}

        {status === "success" && (
          <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-6 text-center">
            <p className="text-green-300 text-sm">
              ✓ You're on the list. We'll reach out at <span className="font-medium">{submittedEmail}</span> when your spot opens.
            </p>
          </div>
        )}

        {status === "duplicate" && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-center">
            <p className="text-amber-300 text-sm">
              You're already on the list. We'll be in touch.
            </p>
          </div>
        )}

        <div className="text-center mt-6">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Already have access? Sign in →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RequestAccess;