import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface GuildInfo {
  name: string
  color?: string
}

export interface SiteConfig {
  guilds: GuildInfo[]
  ranks: string[]
  rolePriority: Record<string, number>
  guildStartDate: string | null
  guildLogo: string | null
}

const DEFAULT_CONFIG: SiteConfig = {
  guilds: [
    { name: '뚠카롱' },
    { name: '뚱카롱' },
    { name: '밤카롱' },
    { name: '별카롱' },
    { name: '달카롱' },
    { name: '꿀카롱' },
  ],
  ranks: ['마스터', '부마스터', '길드원'],
  rolePriority: { '마스터': 0, '부마스터': 1, '길드원': 2 },
  guildStartDate: null,
  guildLogo: null,
}

export function useSiteConfig() {
  return useQuery({
    queryKey: ['site-config'],
    queryFn: async (): Promise<SiteConfig> => {
      const { data } = await supabase
        .from('site_config')
        .select('config')
        .eq('id', 1)
        .maybeSingle()
      if (!data?.config) return DEFAULT_CONFIG
      const cfg = data.config as Record<string, unknown>
      return {
        guilds: (cfg.guilds as GuildInfo[]) || DEFAULT_CONFIG.guilds,
        ranks: (cfg.ranks as string[]) || DEFAULT_CONFIG.ranks,
        rolePriority: (cfg.rolePriority as Record<string, number>) || DEFAULT_CONFIG.rolePriority,
        guildStartDate: (cfg.guildStartDate as string) || null,
        guildLogo: (cfg.guildLogo as string) || null,
      }
    },
    staleTime: 1000 * 60 * 10,
  })
}
