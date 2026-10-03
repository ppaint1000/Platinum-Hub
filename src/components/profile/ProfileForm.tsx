"use client";

// Profile form (like PaintScout's): photo, contact details, a signature you
// draw or upload, a short bio, and changing your password. Images go into
// your own folder in the staff-profiles store.
import { useEffect, useRef, useState } from "react";
import { Camera, Eraser, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveProfileAction } from "@/app/profile/actions";
import { STAFF_PROFILE_BUCKET, staffImageUrl, type StaffProfile } from "@/lib/staffProfile";
import { BLUE, RED, Card } from "@/components/dashboard/parts";

const field = "w-full rounded-lg border border-[#E3E1DA] bg-white px-3 py-2 text-sm text-[#16202E] focus:outline-none focus:ring-2 focus:ring-[#9DB6D9]";
const label = "mb-1 block text-sm font-medium text-[#16202E]";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

async function upload(userId: string, file: Blob, name: string): Promise<string> {
  const supabase = createClient();
  const path = `${userId}/${name}-${Date.now()}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`;
  const { error } = await supabase.storage.from(STAFF_PROFILE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export function ProfileForm({
  userId,
  fullName: initialName,
  email,
  details,
  showsOnProposals,
}: {
  userId: string;
  fullName: string;
  email: string | null;
  details: StaffProfile;
  showsOnProposals: boolean;
}) {
  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(details.phone ?? "");
  const [title, setTitle] = useState(details.title ?? "");
  const [bio, setBio] = useState(details.bio ?? "");
  const [photoPath, setPhotoPath] = useState(details.photo_path);
  const [signaturePath, setSignaturePath] = useState(details.signature_path);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Signature pad ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#16202E";
  }, []);
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };
  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDrawn(true);
  }
  function clearPad() {
    const c = canvasRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      setPhotoPath(await upload(userId, file, "photo"));
    } catch (e) {
      setMessage({ ok: false, text: `Photo didn't upload: ${(e as Error).message}` });
    }
  }
  async function onSignatureFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      setSignaturePath(await upload(userId, file, "signature"));
      clearPad();
    } catch (e) {
      setMessage({ ok: false, text: `Signature didn't upload: ${(e as Error).message}` });
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      let sig = signaturePath;
      if (drawn && canvasRef.current) {
        const blob = await new Promise<Blob | null>((res) => canvasRef.current!.toBlob(res, "image/png"));
        if (blob) sig = await upload(userId, blob, "signature");
      }
      const result = await saveProfileAction({ fullName, phone, title, bio, photoPath, signaturePath: sig });
      if (result.error) throw new Error(result.error);
      setSignaturePath(sig);
      if (drawn) clearPad();
      setMessage({ ok: true, text: "Saved." });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // ── Password ──
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage(null);
    if (pw.length < 8) return setPwMessage({ ok: false, text: "Use at least 8 characters." });
    if (pw !== pw2) return setPwMessage({ ok: false, text: "The two passwords don't match." });
    setPwSaving(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setPwSaving(false);
    if (error) return setPwMessage({ ok: false, text: error.message });
    setPw("");
    setPw2("");
    setPwMessage({ ok: true, text: "Password changed." });
  }

  const photoUrl = staffImageUrl(photoPath);
  const signatureUrl = staffImageUrl(signaturePath);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-5 p-5">
          <section aria-label="Your photo" className="flex items-center gap-4">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white" style={{ background: BLUE }}>
                {initials(fullName) || "?"}
              </span>
            )}
            <div>
              <p className="font-semibold text-[#16202E]">Your photo</p>
              <p className="text-sm text-[#5B6472]">Shown on your proposals.</p>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E3E1DA] px-3 py-1.5 text-sm font-medium text-[#1F4E8C] hover:bg-[#E3ECF8]">
                <Camera className="h-4 w-4" />
                {photoUrl ? "Change photo" : "Upload photo"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
              </label>
            </div>
          </section>

          <section aria-label="Contact information" className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 className="font-semibold text-[#16202E]">Contact information</h2>
              <p className="text-sm text-[#5B6472]">Shown on your proposals so customers can reach you.</p>
            </div>
            <label>
              <span className={label}>Name</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} />
            </label>
            <label>
              <span className={label}>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Estimator" className={field} />
            </label>
            <label>
              <span className={label}>Phone</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 021 123 4567" className={field} />
            </label>
            <label>
              <span className={label}>Email</span>
              <input value={email ?? ""} readOnly className={`${field} bg-[#F5F4F0] text-[#5B6472]`} />
              <span className="mt-1 block text-xs text-[#8A919C]">Your sign-in email. Ask an admin to change it.</span>
            </label>
          </section>

          <section aria-label="Signature" className="flex flex-col gap-2">
            <h2 className="font-semibold text-[#16202E]">Signature</h2>
            <p className="text-sm text-[#5B6472]">Sign in the box, or upload a picture of your signature. Shown under your name on proposals.</p>
            {signatureUrl && !drawn && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signatureUrl} alt="Your current signature" className="h-20 w-auto self-start rounded border border-[#E3E1DA] bg-white p-1" />
            )}
            <canvas
              ref={canvasRef}
              width={600}
              height={160}
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={() => (drawing.current = false)}
              onPointerLeave={() => (drawing.current = false)}
              aria-label="Sign here"
              className="h-32 w-full max-w-lg touch-none rounded-lg border-2 border-dashed border-[#C9CDD3] bg-white"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={clearPad} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3E1DA] px-3 py-1.5 text-sm font-medium text-[#16202E] hover:bg-[#F5F4F0]">
                <Eraser className="h-4 w-4" /> Clear
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E3E1DA] px-3 py-1.5 text-sm font-medium text-[#1F4E8C] hover:bg-[#E3ECF8]">
                <Upload className="h-4 w-4" /> Upload signature
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onSignatureFile(e.target.files?.[0])} />
              </label>
              {signatureUrl && (
                <button type="button" onClick={() => setSignaturePath(null)} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ color: RED }}>
                  Remove signature
                </button>
              )}
            </div>
          </section>

          <section aria-label="About you" className="flex flex-col gap-2">
            <h2 className="font-semibold text-[#16202E]">About you</h2>
            <p className="text-sm text-[#5B6472]">A few lines about you, shown as &ldquo;Your contact&rdquo; on proposals.</p>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className={field} />
          </section>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: BLUE }}
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
            {message && (
              <span className="text-sm font-medium" style={{ color: message.ok ? BLUE : RED }}>
                {message.text}
              </span>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <form onSubmit={changePassword} className="flex flex-col gap-3">
            <h2 className="font-semibold text-[#16202E]">Change password</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className={label}>New password</span>
                <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={field} />
              </label>
              <label>
                <span className={label}>Type it again</span>
                <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={field} />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={pwSaving || !pw} className="rounded-lg border border-[#E3E1DA] px-4 py-2 text-sm font-semibold text-[#16202E] hover:bg-[#F5F4F0] disabled:opacity-50">
                {pwSaving ? "Changing…" : "Change password"}
              </button>
              {pwMessage && (
                <span className="text-sm font-medium" style={{ color: pwMessage.ok ? BLUE : RED }}>
                  {pwMessage.text}
                </span>
              )}
            </div>
          </form>
        </Card>
      </div>

      {showsOnProposals && (
        <aside aria-label="How it shows on proposals" className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-[#5B6472]">How it shows on your proposals</p>
          <div className="rounded-xl border border-[#E3E1DA] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5B6472]">Your contact</p>
            <div className="mt-3 flex items-center gap-3">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full font-bold text-white" style={{ background: BLUE }}>
                  {initials(fullName) || "?"}
                </span>
              )}
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-[#16202E]">{fullName || "Your name"}</p>
                {title && <p className="text-[#5B6472]">{title}</p>}
                {phone && <p className="text-[#16202E]">{phone}</p>}
                {email && <p className="truncate text-[#16202E]">{email}</p>}
              </div>
            </div>
            {bio && <p className="mt-3 whitespace-pre-wrap text-sm text-[#16202E]">{bio}</p>}
            {signatureUrl && !drawn && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signatureUrl} alt="" className="mt-3 h-12 w-auto" />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
