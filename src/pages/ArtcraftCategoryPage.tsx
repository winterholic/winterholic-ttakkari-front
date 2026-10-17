import { useParams } from "react-router";
import { CategoryScreen } from "../features/artcraft/work/CategoryScreen";
import "../features/artcraft/artcraft.css";
import "../features/artcraft/work/work.css";

/** ArtCraft 범주 세부 페이지(/artcraft/c/:category): 지시 · 작업물 · 이력. */
export function ArtcraftCategoryPage() {
  const { category = "" } = useParams();
  return <CategoryScreen categoryId={category} />;
}
