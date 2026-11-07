import type { TaskRoot } from "../../api/types";

/**
 * 서고에서 "메인 작업"은 하위 세션을 거느리고 일을 나눈 뿌리다.
 * 접수 대화(desk)는 같은 목표를 되풀이해 보여 주고, 하위 없는 뿌리는 단발 세션이라 사람이 훑을 때 묻힌다.
 * 숨기기만 하며, 개별 세션은 "전체 세션"과 검색에서 그대로 조회된다.
 */
export const isMainRoot = (r: TaskRoot): boolean => r.kind !== "desk" && r.descendants > 0;
