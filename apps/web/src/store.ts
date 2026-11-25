import { create } from 'zustand';
import type { Role } from '@office/shared';
export type Screen =
  | 'my' | 'leases' | 'library' | 'quality' | 'spaces' | 'imports'
  | 'dashboard'
  | 'booking'
  | 'inventory'
  | 'catalog'
  | 'managers'
  | 'history'
  | 'workplaces'
  | 'offices'
  | 'building'
  | 'floor'
  | 'people'
  | 'departments'
  | 'admin'
  | 'parking'
  | 'editor';
type State = {
  editorDirty?: boolean;
  screen: Screen;
  qualityCategory?:string;
  historyQuery?:string;
  leaseExpiry?:boolean;
  roomFilters?:Record<string,string>;
  registryReturn?:Screen;
  registryFocus?:{screen:Screen;id:string};
  importKind?:string;
  pendingTemplate?:string;
  bookingInterval?:{start:string;end:string};
  bookingSearch?:boolean;
  bookingDesk?:boolean;
  leaseRooms?:string[];
  leaseId?:string;
  leasePicking?:boolean;
  leaseDraft?:{form:Record<string,string>;tenant:string;model:string;commonIds:string[]};
  buildingId: string;
  floorId: string;
  selected: string | null;
  department: string;
  demoRole: Role;
  token: string;
  set: (patch: Partial<State>) => void;
};
export const useUI = create<State>((set, get) => ({
  screen: new URLSearchParams(location.search).get('review')==='admin'?'dashboard':'floor',
  buildingId: '',
  floorId: '',
  selected: null,
  department: '',
  demoRole: new URLSearchParams(location.search).get('review')==='admin'?'admin':'employee',
  token: sessionStorage.getItem('office-token') ?? '',
  set: (patch) => {
    const current=get();
    if(current.editorDirty && (['screen','floorId','buildingId'] as const).some(k=>patch[k]!==undefined&&patch[k]!==current[k])) {
      if(!window.confirm('Есть несохранённые изменения планировки. Покинуть редактор и потерять черновик?'))return;
      patch={...patch,editorDirty:false};
    }
    set(patch);
  },
}));
