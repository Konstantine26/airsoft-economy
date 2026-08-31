import type { TaskStatus, TaskVisibility } from './database.types';

export const TASK_VISIBILITY_LABEL: Record<TaskVisibility, string> = {
  side: 'Для стороны',
  team: 'Для команды',
  personal: 'Личное',
  claimable: 'Можно взять',
  sides: 'Нескольким сторонам',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Открыто',
  claimed: 'Взято в работу',
  completed: 'Выполнено',
  cancelled: 'Отменено',
};

export type TaskSideOption = { id: string; name: string };
export type TaskTeamOption = { id: string; name: string; sideId: string };
export type TaskParticipantOption = { profileId: string; fullName: string; effectiveSideId: string | null; teamId: string | null };
