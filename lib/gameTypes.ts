export type GameType = 'sunday' | 'roleplay' | 'tactical' | 'marathon' | 'night' | 'tournament';

export const GAME_TYPES: GameType[] = ['sunday', 'roleplay', 'tactical', 'marathon', 'night', 'tournament'];

export const GAME_TYPE_LABEL: Record<GameType, string> = {
  sunday: 'Воскресная игра',
  roleplay: 'Ролевая',
  tactical: 'Тактическая',
  marathon: 'Суточная',
  night: 'Ночная',
  tournament: 'Соревнования',
};
