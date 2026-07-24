import { firebaseAdminApp } from "@/lib/firebase-admin";

export type MatchReminderTaskType =
  | "one-hour-match-reminder"
  | "prediction-deadline-reminder";

type ScheduleMatchReminderTasksInput = {
  matchId: string;
  kickoff: Date;
};

type ScheduledTaskNames = {
  oneHourTaskName: string | null;
  predictionDeadlineTaskName: string | null;
};

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;

const location =
  process.env.CLOUD_TASKS_LOCATION || "europe-west1";

const queue =
  process.env.CLOUD_TASKS_QUEUE || "match-reminders";

const appUrl = process.env.APP_URL?.replace(/\/+$/, "");

const taskHandlerSecret =
  process.env.CLOUD_TASKS_HANDLER_SECRET;

function requireCloudTasksConfig() {
  if (!projectId) {
    throw new Error(
      "FIREBASE_ADMIN_PROJECT_ID ortam değişkeni eksik."
    );
  }

  if (!appUrl) {
    throw new Error("APP_URL ortam değişkeni eksik.");
  }

  if (!taskHandlerSecret) {
    throw new Error(
      "CLOUD_TASKS_HANDLER_SECRET ortam değişkeni eksik."
    );
  }
}

async function getGoogleAccessToken(): Promise<string> {
  const credential = firebaseAdminApp.options.credential;

  if (!credential) {
    throw new Error(
      "Firebase Admin kimlik bilgisi bulunamadı."
    );
  }

  const accessToken = await credential.getAccessToken();

  if (!accessToken.access_token) {
    throw new Error(
      "Google Cloud erişim anahtarı alınamadı."
    );
  }

  return accessToken.access_token;
}

function buildTaskId(
  matchId: string,
  reminderType: MatchReminderTaskType
) {
  const safeMatchId = matchId.replace(/[^a-zA-Z0-9_-]/g, "-");

  const suffix =
    reminderType === "one-hour-match-reminder"
      ? "one-hour"
      : "deadline";

  return `${safeMatchId}-${suffix}`;
}

function getQueuePath() {
  requireCloudTasksConfig();

  return `projects/${projectId}/locations/${location}/queues/${queue}`;
}

function getTaskName(
  matchId: string,
  reminderType: MatchReminderTaskType
) {
  return `${getQueuePath()}/tasks/${buildTaskId(
    matchId,
    reminderType
  )}`;
}

function encodeTaskBody(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

async function createReminderTask(
  matchId: string,
  reminderType: MatchReminderTaskType,
  scheduleDate: Date
): Promise<string | null> {
  requireCloudTasksConfig();

  if (Number.isNaN(scheduleDate.getTime())) {
    throw new Error("Geçersiz bildirim zamanı.");
  }

  /*
    Bildirim zamanı geçmişse geçmiş maç için görev oluşturmuyoruz.
  */
  if (scheduleDate.getTime() <= Date.now()) {
    return null;
  }

  const parent = getQueuePath();
  const taskName = getTaskName(matchId, reminderType);
  const accessToken = await getGoogleAccessToken();

  const response = await fetch(
    `https://cloudtasks.googleapis.com/v2/${parent}/tasks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: {
          name: taskName,
          scheduleTime: scheduleDate.toISOString(),
          httpRequest: {
            httpMethod: "POST",
            url: `${appUrl}/api/tasks/match-reminder`,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${taskHandlerSecret}`,
            },
            body: encodeTaskBody({
              matchId,
              reminderType,
            }),
          },
        },
      }),
    }
  );

  if (response.ok) {
    const task = (await response.json()) as {
      name?: string;
    };

    return task.name ?? taskName;
  }

  const errorText = await response.text();

  /*
    Aynı isimli görev zaten varsa çift bildirim oluşturmuyoruz.
  */
  if (response.status === 409) {
    return taskName;
  }

  throw new Error(
    `Cloud Tasks görevi oluşturulamadı (${response.status}): ${errorText}`
  );
}

export async function scheduleMatchReminderTasks({
  matchId,
  kickoff,
}: ScheduleMatchReminderTasksInput): Promise<ScheduledTaskNames> {
  /*
    Maçtan tam 1 saat önce.
  */
  const oneHourReminderDate = new Date(
    kickoff.getTime() - 60 * 60 * 1000
  );

  /*
    Tahminler maçtan 5 dakika önce kapanıyor.
    Kapanıştan 10 dakika önce = maçtan 15 dakika önce.
  */
  const predictionDeadlineReminderDate = new Date(
    kickoff.getTime() - 15 * 60 * 1000
  );

  const [
    oneHourTaskName,
    predictionDeadlineTaskName,
  ] = await Promise.all([
    createReminderTask(
      matchId,
      "one-hour-match-reminder",
      oneHourReminderDate
    ),
    createReminderTask(
      matchId,
      "prediction-deadline-reminder",
      predictionDeadlineReminderDate
    ),
  ]);

  return {
    oneHourTaskName,
    predictionDeadlineTaskName,
  };
}

export async function deleteCloudTask(
  taskName: string | null | undefined
) {
  if (!taskName) {
    return;
  }

  const accessToken = await getGoogleAccessToken();

  const response = await fetch(
    `https://cloudtasks.googleapis.com/v2/${taskName}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (response.ok || response.status === 404) {
    return;
  }

  const errorText = await response.text();

  throw new Error(
    `Cloud Tasks görevi silinemedi (${response.status}): ${errorText}`
  );
}

export async function deleteMatchReminderTasks(
  taskNames: ScheduledTaskNames
) {
  await Promise.all([
    deleteCloudTask(taskNames.oneHourTaskName),
    deleteCloudTask(taskNames.predictionDeadlineTaskName),
  ]);
}