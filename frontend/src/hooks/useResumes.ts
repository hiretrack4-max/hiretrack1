import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosProgressEvent } from 'axios';
import { api } from '@/lib/api';
import type { Paginated, Resume } from '@/types/api';

/** The most recent resume stored for a candidate (or null). */
export function useCandidateResume(candidateId: number | undefined) {
  return useQuery({
    queryKey: ['resumes', 'candidate', candidateId],
    enabled: candidateId !== undefined && !Number.isNaN(candidateId),
    queryFn: async () => {
      const { data } = await api.get<Paginated<Resume>>('/resumes/', {
        params: { candidate: candidateId, ordering: '-uploaded_at' },
      });
      // ResumeViewSet has no filterset, so `?candidate=` may be ignored — filter
      // client-side to be safe (the candidate's upload is among the newest rows).
      return data.results.find((r) => r.candidate === candidateId) ?? null;
    },
  });
}

/** Fields parsed from a resume WITHOUT persisting anything (Add-Candidate). */
export interface ResumeParsePreview {
  filename: string;
  fields: {
    full_name: string;
    email: string;
    mobile: string;
    address: string;
    current_location: string;
    current_company: string;
    current_designation: string;
    highest_qualification: string;
    total_experience_years: string;
    relevant_experience_years: string;
    skills: { name: string; type: string }[];
    certifications: string[];
    experiences: {
      company: string;
      designation: string;
      start_date: string;
      end_date: string;
      is_current: boolean;
    }[];
    parse_flags: string[];
  };
}

/**
 * Parse a dropped resume and return its fields WITHOUT creating any record.
 * The Add-Candidate form uses this to prefill; the Candidate row is only
 * written when the user clicks Save (via {@link useUploadResume}).
 */
export function useParseResumePreview() {
  return useMutation({
    mutationFn: async ({ file, onProgress }: { file: File; onProgress?: (p: number) => void }) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<ResumeParsePreview>('/resumes/parse_preview/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event: AxiosProgressEvent) => {
          if (onProgress && event.total) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      return data;
    },
  });
}

export interface ResumeUploadArgs {
  file: File;
  candidate?: number;
  onProgress?: (percent: number) => void;
}

export function useUploadResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, candidate, onProgress }: ResumeUploadArgs) => {
      const form = new FormData();
      form.append('file', file);
      if (candidate !== undefined) form.append('candidate', String(candidate));

      const { data } = await api.post<Resume>('/resumes/upload/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event: AxiosProgressEvent) => {
          if (onProgress && event.total) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['candidates', 'list'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (data.candidate) {
        qc.invalidateQueries({ queryKey: ['candidates', 'detail', data.candidate] });
      }
    },
  });
}
