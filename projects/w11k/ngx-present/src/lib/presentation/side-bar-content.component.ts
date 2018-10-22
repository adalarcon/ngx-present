import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { PresentationService } from '../core/presentation.service';
import { toAngularComponent } from '@w11k/tydux/dist/angular-integration';
import { Observable } from 'rxjs';
import { MatSlideToggleChange } from '@angular/material';

@Component({
  selector: 'ngx-present-sidebar-content',
  templateUrl: './side-bar-content.component.html',
  styleUrls: ['./side-bar-content.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class SideBarContentComponent implements OnInit, OnDestroy {
  public id = '';
  public showTableOfContent$: Observable<boolean>;
  public showCoordinates$: Observable<boolean>;
  public coordinatesSeparator$: Observable<string>;
  public depth$: Observable<number | undefined>;
  public showExpertMenu$: Observable<boolean>;
  public showSettings$: Observable<boolean>;
  public themeLight$: Observable<boolean>;

  constructor(private readonly presentation: PresentationService) {
    this.presentation.select(state => state.id)
      .bounded(toAngularComponent(this))
      .subscribe(id => this.id = id);

    this.showCoordinates$ = this.presentation
      .selectNonNil(state => state.config.sidebar.tableOfContent.showCoordinates)
      .bounded(toAngularComponent(this));

    this.showTableOfContent$ = this.presentation
      .selectNonNil(state => state.config.sidebar.tableOfContent.enabled)
      .bounded(toAngularComponent(this));

    this.coordinatesSeparator$ = this.presentation
      .selectNonNil(state => state.config.sidebar.tableOfContent.separator)
      .bounded(toAngularComponent(this));

    this.depth$ = this.presentation
      .select(state => state.config.sidebar.tableOfContent.depth)
      .bounded(toAngularComponent(this));

    this.showExpertMenu$ = this.presentation
      .select(state => state.sideBar.expert)
      .bounded(toAngularComponent(this));

    this.showSettings$ = this.presentation
      .select(state => state.sideBar.settings)
      .bounded(toAngularComponent(this));

    this.themeLight$ = this.presentation
      .select(state => state.config.code.theme === 'light')
      .bounded(toAngularComponent(this));
  }

  ngOnInit(): void {}

  closeSideNav() {
    setTimeout(() => {
      this.presentation.dispatch.closeSideBar();
    }, 25);
  }

  startP2P() {}

  ngOnDestroy(): void {}

  setTheme(event: MatSlideToggleChange) {
    this.presentation.dispatch.setCodeTheme(event.checked ? 'light' : 'dark');
  }
}
