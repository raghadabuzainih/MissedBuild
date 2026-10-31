import { axiosClient } from "./axiosClient";
import type { Search } from "./types";

export async function createSearch(query: string): Promise<{ id: string; status: string }> {
  const { data } = await axiosClient.post("/api/searches", { query });
  return data;
}

export async function getSearch(id: string): Promise<Search> {
  const { data } = await axiosClient.get(`/api/searches/${id}`);
  return data;
}
