#!/usr/bin/env node
/**
 * Data Science SFE — demo seed (Phases 1–5)
 *
 * Usage:
 *   cp .env.example .env.local     # fill in URL + service role key
 *   npm run seed
 *
 * Creates:
 *   - the teacher account (username "admin")
 *   - six demo students
 *   - six sessions across the past five weeks (one with an active attendance
 *     code) so the analytics weekly chart has data
 *   - attendance records for every past session
 *   - two assignments, three sample submissions and two announcements
 *     (the welcome post is pinned, to demo the dashboard pin)
 *
 * Safe to run more than once: rows are matched by username/title.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run with: npm run seed  (reads .env.local)");
  process.exit(1);
}

const isProd = (() => {
  try {
    const host = new URL(url).hostname;
    return host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".local");
  } catch {
    return false;
  }
})();

if (isProd && process.env.SEED_ALLOW_PROD !== "1") {
  console.error("Refusing to seed a production project. Set SEED_ALLOW_PROD=1 to override.");
  process.exit(1);
}

if (isProd && !(process.env.SEED_ADMIN_PASSWORD ?? "").trim()) {
  console.error("SEED_ADMIN_PASSWORD is required when seeding production.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN = {
  username: process.env.SEED_ADMIN_USERNAME || "admin",
  fullName: "CS Teacher",
  password: process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!",
};

const STUDENTS = [
  ["sara", "Sara Ahmed"],
  ["omar", "Omar Hassan"],
  ["layla", "Layla Mostafa"],
  ["youssef", "Youssef Ibrahim"],
  ["mariam", "Mariam Adel"],
  ["ali", "Ali Nour"],
];

const studentPassword = process.env.SEED_STUDENT_PASSWORD || "Student123!";

function isoDate(daysFromToday) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

async function findProfile(username) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, student_code, username, role")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureUser({ username, fullName, password, role }) {
  const existing = await findProfile(username);
  if (existing) {
    console.log(`  · ${username} already exists (${existing.student_code})`);
    return existing;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@cshub.local`,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { username, full_name: fullName, display_name: fullName },
  });

  if (error) throw new Error(`createUser(${username}): ${error.message}`);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, student_code, username, role")
    .eq("id", data.user.id)
    .single();

  if (profileError) throw profileError;
  console.log(`  ✓ ${username} → ${profile.student_code} (${role})`);
  return profile;
}

async function upsertSession({ title, date, code, codeMinutes }) {
  const { data: existing, error: findError } = await admin
    .from("sessions")
    .select("id")
    .eq("title", title)
    .maybeSingle();
  if (findError) throw findError;

  let session = existing;
  if (!session) {
    const { data, error } = await admin
      .from("sessions")
      .insert({ title, session_date: date })
      .select("id")
      .single();
    if (error) throw error;
    session = data;
    console.log(`  ✓ session: ${title} (${date})`);
  }

  if (code) {
    const expires = new Date(Date.now() + codeMinutes * 60_000).toISOString();
    const { error } = await admin
      .from("sessions")
      .update({ attendance_code: code, code_expires_at: expires })
      .eq("id", session.id);
    if (error) throw error;
  }

  return session.id;
}

async function main() {
  console.log("\nSeeding Data Science SFE…\n");

  console.log("Teacher");
  const teacher = await ensureUser({
    username: ADMIN.username,
    fullName: ADMIN.fullName,
    password: ADMIN.password,
    role: "admin",
  });

  console.log("\nStudents");
  const students = [];
  for (const [username, fullName] of STUDENTS) {
    students.push(
      await ensureUser({ username, fullName, password: studentPassword, role: "student" }),
    );
  }

  console.log("\nSessions");
  const sessionSpecs = [
    { title: "Lab 02 · Practice: functions", date: isoDate(-35), statuses: [1, 0, 1, 1, 1, 1] },
    { title: "Lab 01 · Practice: loops", date: isoDate(-28), statuses: [1, 1, 2, 1, 0, 1] },
    { title: "Session 01 · Hello, Python", date: isoDate(-21), statuses: [1, 1, 1, 1, 1, 1] },
    { title: "Session 02 · Variables & types", date: isoDate(-14), statuses: [1, 2, 0, 1, 1, 1] },
    { title: "Session 03 · Conditions & loops", date: isoDate(-7), statuses: [1, 1, 1, 2, 0, 1] },
    {
      title: "Session 04 · Functions & scope",
      date: isoDate(0),
      statuses: [1, 1, 1, 1, 1, 1],
      code: "DS101",
      codeMinutes: 45,
    },
  ];

  const sessionIds = [];
  for (const spec of sessionSpecs) {
    sessionIds.push(
      await upsertSession({
        title: spec.title,
        date: spec.date,
        code: spec.code,
        codeMinutes: spec.codeMinutes,
      }),
    );
  }

  console.log("\nAttendance");
  for (let i = 0; i < sessionIds.length; i += 1) {
    const statuses = sessionSpecs[i].statuses;
    const rows = students.map((student, j) => ({
      session_id: sessionIds[i],
      student_id: student.id,
      status: ["absent", "present", "late"][statuses[j]],
      marked_by: "admin",
    }));
    const { error } = await admin
      .from("attendance")
      .upsert(rows, { onConflict: "session_id,student_id" });
    if (error) throw error;
  }
  console.log(`  ✓ ${sessionIds.length * students.length} attendance rows`);

  console.log("\nAssignments");
  const assignments = [
    {
      title: "Assignment 1 · Sum of two numbers",
      description:
        "Read two integers and print their sum on a single line. Follow the exact output format.",
      rubric:
        "40% runs without syntax errors and uses input(); 30% reads both integers correctly; 20% correct sum; 10% readable names and indentation.",
      expected_output: "Input: 3 5\nOutput: 8",
      max_score: 100,
      deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
    {
      title: "Assignment 2 · Even or odd",
      description:
        "Read one integer and print \"Even\" if it is divisible by 2, otherwise print \"Odd\". Use an if/else statement.",
      rubric:
        "40% correct logic; 25% handles negative numbers; 20% exact output; 15% clean formatting.",
      expected_output: "Input: 4\nOutput: Even",
      max_score: 100,
      deadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    },
  ];

  for (const assignment of assignments) {
    const { data: existing, error: findError } = await admin
      .from("assignments")
      .select("id")
      .eq("title", assignment.title)
      .maybeSingle();
    if (findError) throw findError;
    if (existing) {
      console.log(`  · ${assignment.title} already exists`);
      continue;
    }
    const { error } = await admin.from("assignments").insert({
      ...assignment,
      created_by: teacher.id,
    });
    if (error) throw error;
    console.log(`  ✓ ${assignment.title}`);
  }

  console.log("\nSample submissions");
  const { data: firstAssignment, error: firstAssignmentError } = await admin
    .from("assignments")
    .select("id, title, max_score")
    .eq("title", assignments[0].title)
    .maybeSingle();
  if (firstAssignmentError) throw firstAssignmentError;

  if (firstAssignment) {
    const samples = [
      {
        student: students[0],
        score: 92,
        feedback:
          "Correct sum and clean structure. Prefer descriptive variable names instead of a and b.",
        feedbackAr:
          "المجموع صحيح والبنية واضحة. يُفضّل استخدام أسماء متغيرات وصفية بدلًا من a و b.",
        issues: ["Variable names could be more descriptive."],
        code: [
          "first = int(input())",
          "second = int(input())",
          "print(first + second)",
        ].join("\n"),
      },
      {
        student: students[1],
        score: 74,
        feedback:
          "The sum is correct, but input is not checked and the program prints extra text. Match the expected output exactly.",
        feedbackAr:
          "المجموع صحيح، لكن المدخلات غير مُتحقَّق منها والبرنامج يطبع نصًا إضافيًا. التزم بالناتج المتوقع تمامًا.",
        issues: ["Extra text in the output.", "No check that reading succeeded."],
        code: [
          "a = int(input())",
          "b = int(input())",
          'print("Sum is:", a + b)',
        ].join("\n"),
      },
      {
        student: students[2],
        score: 55,
        feedback:
          "The program reads a single number and prints it, not the sum of two numbers. Re-read the task.",
        feedbackAr:
          "البرنامج يقرأ رقمًا واحدًا ويطبعه، وليس مجموع رقمين. أعد قراءة المطلوب.",
        issues: ["Only one value is read.", "No addition is performed."],
        code: [
          "value = int(input())",
          "print(value)",
        ].join("\n"),
      },
    ];

    for (const sample of samples) {
      const { data: existing, error: findSubmissionError } = await admin
        .from("submissions")
        .select("id")
        .eq("assignment_id", firstAssignment.id)
        .eq("student_id", sample.student.id)
        .maybeSingle();
      if (findSubmissionError) throw findSubmissionError;
      if (existing) {
        console.log(`  · submission for ${sample.student.username} already exists`);
        continue;
      }

      const path = `${sample.student.id}/${firstAssignment.id}/seed-${sample.student.username}.py`;
      const { error: uploadError } = await admin.storage
        .from("submissions")
        .upload(path, sample.code, {
          contentType: "text/x-python",
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const now = new Date().toISOString();
      const { error } = await admin.from("submissions").insert({
        assignment_id: firstAssignment.id,
        student_id: sample.student.id,
        file_path: path,
        code_text: sample.code,
        ai_score: sample.score,
        ai_feedback: sample.feedback,
        ai_feedback_ar: sample.feedbackAr,
        ai_issues: sample.issues,
        ai_model: "seed-demo",
        ai_graded_at: now,
        final_score: sample.score,
        status: "graded",
        graded_at: now,
        graded_by: "ai",
      });
      if (error) throw error;
      console.log(`  ✓ submission: ${sample.student.username} (${sample.score})`);
    }
  }

  console.log("\nAnnouncements");
  const announcements = [
    {
      title: "Welcome to Data Science SFE",
      body:
        "This is where attendance, assignments and your progress live. Your username was given to you by your teacher — keep your password private.",
      pinned: true,
    },
    {
      title: "Bring your laptops on Thursday",
      body:
        "We will write our first complete Python program together. Install Python 3 (or use an online IDE) before the session if you can.",
      pinned: false,
    },
  ];

  for (const announcement of announcements) {
    const { data: existing, error: findError } = await admin
      .from("announcements")
      .select("id")
      .eq("title", announcement.title)
      .maybeSingle();
    if (findError) throw findError;
    if (existing) {
      // Older seeds created rows before the pinned column; keep it in sync.
      const { error: pinError } = await admin
        .from("announcements")
        .update({ pinned: announcement.pinned })
        .eq("id", existing.id);
      if (pinError) throw pinError;
      console.log(`  · ${announcement.title} already exists`);
      continue;
    }
    const { error } = await admin
      .from("announcements")
      .insert({ ...announcement, created_by: teacher.id });
    if (error) throw error;
    console.log(`  ✓ ${announcement.title}${announcement.pinned ? " (pinned)" : ""}`);
  }

  // Generate a fresh active code for today's session on every seed run.
  const { error: codeError } = await admin
    .from("sessions")
    .update({
      attendance_code: "DS101",
      code_expires_at: new Date(Date.now() + 45 * 60_000).toISOString(),
    })
    .eq("id", sessionIds[sessionIds.length - 1]);
  if (codeError) throw codeError;

  console.log("\n──────────────────────────────────────────────");
  console.log("Done.\n");
  console.log("Teacher login:");
  console.log(`  username: ${ADMIN.username}`);
  console.log(`  password: ${ADMIN.password}`);
  console.log("\nDemo student login (all six students):");
  console.log(`  username: ${STUDENTS.map(([u]) => u).join(", ")}`);
  console.log(`  password: ${studentPassword}`);
  console.log("\nActive attendance code for today's session: DS101");
  console.log("──────────────────────────────────────────────\n");
  if (ADMIN.password === "ChangeMe123!" || studentPassword === "Student123!") {
    console.log("⚠  Change the demo passwords before using this with a real class.\n");
  }
}

main().catch((error) => {
  console.error("\nSeed failed:", error.message || error);
  process.exit(1);
});
