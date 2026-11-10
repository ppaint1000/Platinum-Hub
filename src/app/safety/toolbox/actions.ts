"use server";

// Health & safety → Toolbox: save and delete toolbox meetings and who was
// there. Supervisors and admins only - checked here and again by the
// database (supabase/safety_toolbox.sql).
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; id?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type ToolboxInput = {
  id?: string;
  meetingDate: string;
  siteId: string;
  location: string;
  topic: string;
  topicKey: string;
  talkingPoints: string;
  issues: string;
  actions: string;
  visitors: string[];
  ledBy: string;
  attendees: string[];
};

async function managerClient() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("safety_manager");
  return data === true ? supabase : null;
}

export async function saveToolboxAction(m: ToolboxInput): Promise<Result> {
  const supabase = await managerClient();
  if (!supabase) return { error: "Only supervisors and admins can record toolbox meetings." };

  const topic = m.topic.trim();
  if (!topic) return { error: "Pick or type a topic." };
  if (!DAY.test(m.meetingDate)) return { error: "Pick the date of the meeting." };
  const attendees = [...new Set(m.attendees.filter(Boolean))];
  const visitors = m.visitors.map((v) => v.trim()).filter(Boolean);
  if (!attendees.length && !visitors.length) return { error: "Tick who was at the meeting." };

  const row = {
    meeting_date: m.meetingDate,
    site_id: m.siteId || null,
    location: m.location.trim() || null,
    topic,
    topic_key: m.topicKey || null,
    talking_points: m.talkingPoints.trim() || null,
    issues: m.issues.trim() || null,
    actions: m.actions.trim() || null,
    visitors,
    led_by: m.ledBy || null,
    updated_at: new Date().toISOString(),
  };

  let id = m.id;
  if (id) {
    const { error } = await supabase.from("toolbox_meetings").update(row).eq("id", id);
    if (error) return { error: error.message };
    const { error: delError } = await supabase.from("toolbox_attendance").delete().eq("meeting_id", id);
    if (delError) return { error: delError.message };
  } else {
    const { data, error } = await supabase.from("toolbox_meetings").insert(row).select("id").single<{ id: string }>();
    if (error || !data) return { error: error?.message ?? "Couldn't save the meeting." };
    id = data.id;
  }

  if (attendees.length) {
    const { error } = await supabase
      .from("toolbox_attendance")
      .insert(attendees.map((user_id) => ({ meeting_id: id, user_id })));
    if (error) return { error: error.message };
  }

  revalidatePath("/safety/toolbox");
  return { id };
}

export async function deleteToolboxAction(id: string): Promise<Result> {
  const supabase = await managerClient();
  if (!supabase) return { error: "Only supervisors and admins can delete toolbox meetings." };
  const { error } = await supabase.from("toolbox_meetings").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/safety/toolbox");
  return {};
}
