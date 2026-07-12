import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import type { Paginated, ReportConfiguration } from '@/types/api';

export interface ReportExportParams {
  /** 'candidate' (default) | 'job' | 'openings'. */
  report_type?: string;
  format: string;
  date_filter: string;
  start?: string;
  end?: string;
  columns?: string;
  /** 'week' | 'month' | 'year' — only used by report_type=openings. */
  grain?: string;
  config?: string;
}

/** Trigger an authenticated report download (blob → object URL). */
export function useExportReport() {
  return useMutation({
    mutationFn: async (params: ReportExportParams) => {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') clean[k] = v;
      }
      await downloadFile('/reports/export/', clean);
    },
  });
}

export function useReportConfigs() {
  return useQuery({
    queryKey: ['report-configs'],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ReportConfiguration>>('/report-configs/', {
        params: { ordering: 'name' },
      });
      return data.results;
    },
  });
}

export interface ReportConfigInput {
  name: string;
  date_filter: string;
  custom_start: string | null;
  custom_end: string | null;
  columns: string[];
  export_format: string;
}

export function useCreateReportConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ReportConfigInput) => {
      const { data } = await api.post<ReportConfiguration>('/report-configs/', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-configs'] }),
  });
}

export function useDeleteReportConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/report-configs/${id}/`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-configs'] }),
  });
}
