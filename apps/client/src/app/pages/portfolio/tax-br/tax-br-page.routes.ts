import { AuthGuard } from '@ghostfolio/client/core/auth.guard';

import { Routes } from '@angular/router';

import { GfTaxBrPageComponent } from './tax-br-page.component';

export const routes: Routes = [
  {
    canActivate: [AuthGuard],
    component: GfTaxBrPageComponent,
    path: '',
    title: 'Calculadora de IR'
  }
];
