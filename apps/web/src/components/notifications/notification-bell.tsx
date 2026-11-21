import { useNavigate } from "@tanstack/react-router";
import { OverlayPanel } from "primereact/overlaypanel";
import { useRef } from "react";
import { type NotificationItem, useNotifications } from "../../lib/notifications";
import { notificationText, relativeTime } from "./notification-text";

export function badgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export function NotificationBell() {
  const panel = useRef<OverlayPanel>(null);
  const navigate = useNavigate();
  const { query, markRead } = useNotifications(true);
  const items = query.data?.items ?? [];
  const unread = query.data?.unreadCount ?? 0;

  const open = (item: NotificationItem) => {
    if (!item.readAt) markRead(item.id);
    panel.current?.hide();
    void navigate({ to: "/matches/$matchId", params: { matchId: item.matchId } });
  };

  return (
    <>
      <button
        type="button"
        className="relative cursor-pointer rounded p-2 text-gray-700 hover:bg-gray-100"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={(event) => panel.current?.toggle(event)}
      >
        <i className="pi pi-bell text-xl" aria-hidden="true" />
        {unread > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-semibold text-white"
          >
            {badgeLabel(unread)}
          </span>
        )}
      </button>
      <OverlayPanel ref={panel} aria-label="Notifications">
        <div className="w-72 max-w-full">
          {query.isError && (
            <p role="status" className="mb-2 text-xs text-gray-500">
              Couldn't refresh notifications. Retrying…
            </p>
          )}
          {items.length === 0 ? (
            <p className="text-sm text-gray-600">No notifications yet</p>
          ) : (
            <ul className="flex max-h-80 flex-col overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-unread={item.readAt ? "false" : "true"}
                    className={`w-full cursor-pointer border-b border-gray-100 px-2 py-2 text-left hover:bg-gray-50 ${
                      item.readAt ? "text-gray-600" : "bg-indigo-50 font-semibold"
                    }`}
                    onClick={() => open(item)}
                  >
                    <span className="block text-sm">{notificationText(item)}</span>
                    <span className="block text-xs font-normal text-gray-500">
                      {relativeTime(item.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </OverlayPanel>
    </>
  );
}
