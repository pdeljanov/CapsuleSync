# Capsule Sync


Capsule Sync is a dead-simple peer-to-peer secure file synchronization solution optimized for mobile devices.

## Top-to-Bottom Summary

* A network is formed when two devices pair to each other. This network persists until there is only one device left.
* Tertiary devices only need to pair to one device in the network. The other devices will be auto-paired to the tertiary device.
* A network can consist of any number of devices.
* Each device on the network creates a collection of *Capsules*.
* Capsules have a file and folder matching rule-set:
  * This can match specific files and folders
  * Or, be more generic, such as match all `audio/mp3` file types
* When a Capsule is created on a device in the network, it is broadcasted to the network.
* Each device may choose which Capsules to subscribe too and sync from.
* Synchronization is defaulted to one-way, but bidirectional synchronization and conflict resolution will be fully supported by the protocol and presented as an option per Capsule.
* A *Capsule Containment Unit* is a device in the network that synchronizes and replicates all Capsules in the network.
  * The use-case is primarily targeted towards users who want an always-on server to be available for synchronization.
* **Future Idea:** Intelligently distribute Capsule contents across a network such that atleast 1 replica of every file exists on the network at all times.

## Status

This project is not being developed at this time. Please look to [Syncthing](https://syncthing.net/) for a similar project.