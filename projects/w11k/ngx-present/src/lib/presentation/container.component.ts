import { AfterViewInit, Component, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { MatSidenav } from '@angular/material';
import { PresentationService } from '../core/presentation.service';
import { untilComponentDestroyed } from '@w11k/ngx-componentdestroyed';
import { EventService } from '../core/event.service';

@Component({
  selector: 'ngx-present-container',
  templateUrl: './container.component.html',
  styleUrls: ['./container.component.scss']
})
export class ContainerComponent implements AfterViewInit, OnDestroy {
  @ViewChild(MatSidenav)
  private sideNav: MatSidenav | undefined;

  constructor(private readonly presentation: PresentationService,
              private readonly events: EventService) {
  }

  ngAfterViewInit(): void {
    this.presentation
      .select(state => state.sideBar.open)
      .pipe(
        untilComponentDestroyed(this),)
      .subscribe(status => {
        if (this.sideNav === undefined) {
          throw new Error(`Couldn't find side nav component as child`);
        }

        if (status) {
          this.sideNav.open();
        } else {
          this.sideNav.close();
        }
      });
  }

  onSideNavClose(opened: boolean) {
    if (!opened) {
      this.presentation.dispatch.closeSideBar();
    }
  }

  ngOnDestroy(): void {}

  @HostListener('document:keydown', ['$event'])
  onKeyPressed(event: KeyboardEvent) {
    this.events.processKeyboardEvent(event);
  }

}
