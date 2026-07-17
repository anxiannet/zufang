import type { Metadata } from "next";
import { MyListingPreferences } from "@/components/listings/MyListingPreferences";

export const metadata: Metadata = {
  title: "我的房源列表",
  description: "查看保存在当前浏览器中的收藏、稍后联系、已租和不喜欢房源。"
};

export default function MyListingsPage() {
  return <MyListingPreferences />;
}
