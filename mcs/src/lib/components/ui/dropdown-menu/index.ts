import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

import Content from './dropdown-menu-content.svelte';
import Item from './dropdown-menu-item.svelte';
import Trigger from './dropdown-menu-trigger.svelte';
import Group from './dropdown-menu-group.svelte';
import GroupHeading from './dropdown-menu-group-heading.svelte';
import Separator from './dropdown-menu-separator.svelte';

const Root = DropdownMenuPrimitive.Root;
const Portal = DropdownMenuPrimitive.Portal;

export {
	Root,
	Trigger,
	Content,
	Item,
	Group,
	GroupHeading,
	Separator,
	Portal,
	//
	Root as DropdownMenu,
	Trigger as DropdownMenuTrigger,
	Content as DropdownMenuContent,
	Item as DropdownMenuItem,
	Group as DropdownMenuGroup,
	GroupHeading as DropdownMenuGroupHeading,
	Separator as DropdownMenuSeparator,
	Portal as DropdownMenuPortal
};
