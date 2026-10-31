import { isAxiosError } from "axios";
import { axiosClient } from "./axiosClient";
import type { Analysis, AnalysisFilter, AnalysisProgress, RepositoryDetail, RepositoryList } from "./types";

// Above the backend's worst case (~181 s: 90 s per AI attempt, one retry).
const ANALYSIS_TIMEOUT_MS = 190_000;

// Saved repositories in one category, most stars first, optionally by analysis status.
export async function listRepositories(params: {
  category: string;
  analysis: AnalysisFilter;
  limit: number;
  offset: number;
}): Promise<RepositoryList> {
  const { data } = await axiosClient.get("/api/repositories", { params });
  return data;
}

export async function getRepositoryDetail(id: string): Promise<RepositoryDetail> {
  const { data } = await axiosClient.get(`/api/repositories/${id}`);
  return data;
}

// Null when the repository has not been analyzed yet.
export async function getLatestAnalysis(id: string): Promise<Analysis | null> {
  try {
    const { data } = await axiosClient.get(`/api/repositories/${id}/analysis`);
    return data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.data?.error?.code === "ANALYSIS_NOT_FOUND") return null;
    throw error;
  }
}

// Progress of a running (or just finished) analysis; null when none. Read from
// the server's memory: no AI request.
export async function getAnalysisProgress(id: string): Promise<AnalysisProgress | null> {
  const { data } = await axiosClient.get(`/api/repositories/${id}/analysis/progress`);
  return data.progress;
}

export async function analyzeRepository(id: string): Promise<Analysis> {
  const { data } = await axiosClient.post(`/api/repositories/${id}/analysis`, undefined, {
    timeout: ANALYSIS_TIMEOUT_MS,
  });
  return data;
}
