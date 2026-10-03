"use client";

// Records the customer opening their proposal link, and how long they spend
// on it (only while the page is actually on screen). The first time it's
// opened the office is told (Hub: "Viewed").
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const HEARTBEAT_MS = 15000;

export function ViewTracker({ token }: { token: string }) {
  useEffect(() => {
    const supabase = createClient();
    const viewId = crypto.randomUUID();
    let seconds = 0;
    let lastTick = Date.now();

    // Awaited so the request is actually sent - a Supabase query only runs
    // once something waits on it.
    const record = async () => {
      await supabase.rpc("proposal_record_view", {
        p_token: token,
        p_view_id: viewId,
        p_seconds: Math.round(seconds),
        p_user_agent: navigator.userAgent,
      });
    };

    record().then(() => {
      // Tells the Hub it was opened (count and time). Never blocks the page.
      fetch(`/api/proposals/${token}/viewed`, { method: "POST" }).catch(() => {});
    });

    const timer = window.setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "visible") seconds += (now - lastTick) / 1000;
      lastTick = now;
      record();
    }, HEARTBEAT_MS);

    const onVisibility = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        seconds += (now - lastTick) / 1000;
        record();
      }
      lastTick = now;
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token]);

  return null;
}
