import { AuthGuard } from '@ghostfolio/client/core/auth.guard';

import { Routes } from '@angular/router';

import { GfContributionPlanPageComponent } from './contribution-plan-page.component';

export const routes: Routes = [
  {
    canActivate: [AuthGuard],
    component: GfContributionPlanPageComponent,
    path: '',
    title: 'Planejador de aporte'
  }
];
