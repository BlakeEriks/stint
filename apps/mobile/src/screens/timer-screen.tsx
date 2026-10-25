import { radius } from '@stint/design-tokens';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { text, useColors } from '../theme.ts';
import {
  Notice,
  type NoticeProps,
  Swatch,
  styles as parts,
  Wordmark,
} from './parts.tsx';

export interface PickerProject {
  id: string;
  name: string;
  clientName: string | null;
  color: string | null;
}

export interface RecentTask {
  taskName: string;
  projectId: string | null;
  projectName: string | null;
  color: string | null;
}

interface RunningTimer {
  taskName: string;
  projectName: string | null;
  clientName: string | null;
  color: string | null;
  /** `1:47:32`, from the shared timer's live seconds. */
  readout: string;
}

export interface TimerScreenProps {
  /** The backend, beside the wordmark; null on production. */
  label: string | null;
  /** In whole minutes, so only the readout moves by the second. */
  today: string;
  /** Null until fetched: a zero would claim "earned nothing". */
  earned: string | null;
  recent: RecentTask[];
  running: RunningTimer | null;
  /** Active projects, for the picker. */
  projects: PickerProject[];
  /** The picker's choice until the user makes one: the last task's project. */
  defaultProjectId: string | null;
  notice: NoticeProps | null;
  onStart: (taskName: string, projectId: string | null) => void;
  onRecent: (task: RecentTask) => void;
  onStop: () => void;
  onSettings: () => void;
}

/**
 * The phone's one screen (`specs/012-mobile-timer/design/timer.html`):
 * Today and Earned lead, Recent fills the middle, and the whole timer is
 * docked at the foot in thumb reach. Presentational: `timer-container.tsx`
 * feeds it, so each state is a story.
 */
export function TimerScreen(props: TimerScreenProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        s.screen,
        { backgroundColor: c['bg-base'], paddingTop: insets.top + 6 },
      ]}
    >
      <View style={[parts.row, s.head]}>
        <View style={[parts.row, { gap: 8 }]}>
          <Wordmark />
          {props.label && (
            <Text
              style={[
                text('meta'),
                s.badge,
                { color: c.warning, borderColor: c['border-default'] },
              ]}
            >
              {props.label}
            </Text>
          )}
        </View>
        <Pressable
          onPress={props.onSettings}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={[s.gear, { borderColor: c['border-subtle'] }]}
        >
          <Text style={[text('control'), { color: c['text-muted'] }]}>⚙</Text>
        </Pressable>
      </View>
      {props.notice && <Notice {...props.notice} />}
      <Figures today={props.today} earned={props.earned} />
      <ScrollView style={parts.grow} contentContainerStyle={s.pad}>
        <Recent tasks={props.recent} onPick={props.onRecent} />
      </ScrollView>
      <View
        style={[
          s.dock,
          {
            backgroundColor: c['bg-primary'],
            borderTopColor: c['border-subtle'],
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        {props.running ? (
          <RunningDock running={props.running} onStop={props.onStop} />
        ) : (
          <StoppedDock {...props} />
        )}
      </View>
    </View>
  );
}

function Figures({ today, earned }: { today: string; earned: string | null }) {
  const c = useColors();
  const figure = (label: string, value: string) => (
    <View
      style={[
        s.stat,
        { backgroundColor: c['bg-primary'], borderColor: c['border-subtle'] },
      ]}
    >
      <Text style={[text('label'), { color: c['text-subtle'] }]}>{label}</Text>
      <Text style={[text('amount-hero'), { color: c['text-strong'] }]}>
        {value}
      </Text>
    </View>
  );
  return (
    <View style={[parts.row, s.figures]}>
      {figure('Today', today)}
      {figure('Earned', earned ?? '—')}
    </View>
  );
}

function Recent({
  tasks,
  onPick,
}: {
  tasks: RecentTask[];
  onPick: (task: RecentTask) => void;
}) {
  const c = useColors();
  return (
    <View>
      <Text style={[text('label'), s.recentHead, { color: c['text-subtle'] }]}>
        Recent
      </Text>
      {tasks.length === 0 && (
        <Text style={[text('support'), s.empty, { color: c['text-muted'] }]}>
          Tasks you track show here, to start again in one tap.
        </Text>
      )}
      {tasks.map((task, i) => (
        <Pressable
          key={`${task.taskName}:${task.projectId}`}
          onPress={() => onPick(task)}
          accessibilityRole="button"
          accessibilityLabel={`Start ${task.taskName || 'untitled'}`}
          style={[
            parts.row,
            s.recentRow,
            i > 0 && { borderTopWidth: 1, borderTopColor: c['border-subtle'] },
          ]}
        >
          <Swatch color={task.color} />
          <View style={parts.grow}>
            <Text
              numberOfLines={1}
              style={[text('control'), { color: c['text-strong'] }]}
            >
              {task.taskName || 'Untitled'}
            </Text>
            <Text
              numberOfLines={1}
              style={[text('meta'), { color: c['text-muted'] }]}
            >
              {task.projectName ?? 'No project'}
            </Text>
          </View>
          <View style={[s.play, { borderColor: c['border-default'] }]}>
            <Triangle color={c['text-muted']} size={9} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function RunningDock({
  running,
  onStop,
}: {
  running: RunningTimer;
  onStop: () => void;
}) {
  const c = useColors();
  const where = [running.projectName, running.clientName]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[parts.row, { gap: 12, alignItems: 'flex-start' }]}>
      <View style={[s.live, { backgroundColor: c['timer-running'] }]} />
      <View style={parts.grow}>
        <Text
          style={[text('figure'), { color: c['timer-running'] }]}
          accessibilityLabel={`Running for ${running.readout}`}
        >
          {running.readout}
        </Text>
        <Text
          numberOfLines={1}
          style={[text('body'), { color: c['text-strong'], marginTop: 2 }]}
        >
          {running.taskName || 'Untitled'}
        </Text>
        <View style={[parts.row, { gap: 6, marginTop: 2 }]}>
          <Swatch color={running.color} size={8} />
          <Text
            numberOfLines={1}
            style={[text('meta'), parts.grow, { color: c['text-muted'] }]}
          >
            {where || 'No project'}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onStop}
        accessibilityRole="button"
        accessibilityLabel="Stop timer"
        style={[
          s.transport,
          {
            backgroundColor: c['bg-elevated'],
            borderWidth: 1,
            borderColor: c['border-default'],
          },
        ]}
      >
        <View style={[s.square, { backgroundColor: c['text-primary'] }]} />
      </Pressable>
    </View>
  );
}

function StoppedDock({
  projects,
  defaultProjectId,
  onStart,
}: TimerScreenProps) {
  const c = useColors();
  const [task, setTask] = useState('');
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const projectId = picked === undefined ? defaultProjectId : picked;
  const project = projects.find((p) => p.id === projectId) ?? null;

  const start = () => {
    onStart(task.trim(), project?.id ?? null);
    setTask('');
  };

  return (
    <View style={{ gap: 12 }}>
      <TextInput
        value={task}
        onChangeText={setTask}
        onSubmitEditing={start}
        returnKeyType="go"
        placeholder="What are you working on?"
        placeholderTextColor={c['text-subtle']}
        accessibilityLabel="Task"
        style={[
          text('body'),
          s.field,
          {
            color: c['text-strong'],
            backgroundColor: c['bg-base'],
            borderColor: c['border-default'],
          },
        ]}
      />
      <View style={[parts.row, { gap: 12 }]}>
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`Project: ${project?.name ?? 'No project'}`}
          style={[
            parts.row,
            parts.grow,
            s.picker,
            { backgroundColor: c['bg-base'], borderColor: c['border-default'] },
          ]}
        >
          <Swatch color={project ? project.color : null} />
          <Text
            numberOfLines={1}
            style={[text('control'), parts.grow, { color: c['text-primary'] }]}
          >
            {project?.name ?? 'No project'}
          </Text>
          <Text style={[text('control'), { color: c['text-subtle'] }]}>▾</Text>
        </Pressable>
        <Pressable
          onPress={start}
          accessibilityRole="button"
          accessibilityLabel="Start timer"
          style={[s.transport, { backgroundColor: c['accent-default'] }]}
        >
          <Triangle color={c['text-on-accent']} size={15} />
        </Pressable>
      </View>
      <ProjectPicker
        open={picking}
        projects={projects}
        onPick={(id) => {
          setPicked(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

function ProjectPicker({
  open,
  projects,
  onPick,
  onClose,
}: {
  open: boolean;
  projects: PickerProject[];
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const rows: Array<PickerProject | null> = [null, ...projects];
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={[s.scrim, { backgroundColor: c.overlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        style={[
          s.sheet,
          {
            backgroundColor: c['bg-elevated'],
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <Text
          style={[text('label'), s.recentHead, { color: c['text-subtle'] }]}
        >
          Project
        </Text>
        <FlatList
          data={rows}
          keyExtractor={(p) => p?.id ?? 'none'}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item?.id ?? null)}
              accessibilityRole="button"
              style={[parts.row, s.recentRow]}
            >
              <Swatch color={item ? item.color : null} />
              <View style={parts.grow}>
                <Text style={[text('control'), { color: c['text-strong'] }]}>
                  {item?.name ?? 'No project'}
                </Text>
                {item?.clientName && (
                  <Text style={[text('meta'), { color: c['text-muted'] }]}>
                    {item.clientName}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

/** The play glyph, drawn so it takes the color it is given. */
function Triangle({ color, size }: { color: string; size: number }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginLeft: size * 0.25,
        borderLeftWidth: size,
        borderTopWidth: size * 0.65,
        borderBottomWidth: size * 0.65,
        borderLeftColor: color,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
      }}
    />
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  head: {
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  gear: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  figures: { gap: 12, paddingHorizontal: 20 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, gap: 2 },
  pad: { paddingHorizontal: 20, paddingBottom: 12 },
  recentHead: { marginTop: 18, marginBottom: 2 },
  empty: { paddingVertical: 18 },
  recentRow: { gap: 12, paddingVertical: 13 },
  play: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dock: { borderTopWidth: 1, paddingTop: 16, paddingHorizontal: 20 },
  live: { width: 10, height: 10, borderRadius: radius.full, marginTop: 14 },
  transport: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  square: { width: 16, height: 16, borderRadius: radius.sm },
  field: {
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  picker: {
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scrim: { flex: 1 },
  sheet: {
    maxHeight: '70%',
    paddingHorizontal: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
});
